import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";
import { startStub } from "./stub-server";

// One run is enough: this proves the server-side path, not a layout.
test.describe.configure({ mode: "serial" });

const stub = startStub(4010);

test.beforeAll(async () => {
  await stub.listen();
  // Point the database webhook at the app under test, reachable from the DB container.
  const admin = adminClient();
  await admin.from("app_config").upsert([
    { key: "app_url", value: "http://host.docker.internal:3000" },
    { key: "intake_webhook_on", value: "true" },
  ]);
  // Clear older unfiled events so this run measures only its own.
  await admin.from("intake_events").update({ filed_at: new Date().toISOString(), judged_at: new Date().toISOString() }).is("filed_at", null);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  await admin.from("intake_events").update({ routine_fired_at: hourAgo }).gt("routine_fired_at", hourAgo);
});

test.afterAll(async () => {
  await adminClient().from("app_config").delete().in("key", ["app_url", "intake_webhook_on"]);
  await stub.close();
});

test("an answer reaches the filing route through the database webhook and is filed within a minute", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "server-side path, run once");
  const s = await seedEngagement({ label: "intake-e2e" });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[0]}`);
  await page.getByLabel(/A\. Three carts as specified/).check();
  await page.getByLabel("Why, and anything we've missed").fill("Sample reasoning for the webhook test.");
  const sentAt = Date.now();
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByTestId("answer-summary")).toBeVisible();

  const admin = adminClient();
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("intake_events").select("filed_at").eq("engagement_id", s.engagementId).eq("kind", "answer");
        return data?.[0]?.filed_at ?? null;
      },
      { timeout: 60_000, intervals: [500] },
    )
    .not.toBeNull();
  const { data: ev } = await admin.from("intake_events").select("filed_at, routine_fired_at").eq("engagement_id", s.engagementId).single();
  const seconds = (new Date(ev!.filed_at).getTime() - sentAt) / 1000;
  expect(seconds).toBeLessThan(60);

  // Fibery got one dated line naming the card, with the app's own link.
  expect(stub.docs["wiki-secret"]).toMatch(/Test guest answered "Cart requirements v1\.0 \(sample\)": A, Three carts as specified/);
  expect(stub.calls.every((c) => c.url === "/fire" || c.auth === "Token e2e-fibery-token")).toBe(true);

  // The AG-095 routine was fired once with its own token and the beta header.
  await expect.poll(() => stub.calls.filter((c) => c.url === "/fire").length, { timeout: 10_000 }).toBeGreaterThan(0);
  const fire = stub.calls.find((c) => c.url === "/fire")!;
  expect(fire.auth).toBe("Bearer e2e-routine-token");
  expect(fire.headers["anthropic-beta"]).toBe("experimental-cc-routine-2026-04-01");
  expect(JSON.parse(fire.body).text).toContain("answer");
});

test("a question back is filed as a Horizon for Matt through the same path", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "server-side path, run once");
  const s = await seedEngagement({ label: "intake-e2e-q" });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[1]}`);
  await page.getByRole("button", { name: "Ask Matt a question instead" }).click();
  await page.getByLabel("What do you need to know first?").fill("Sample question for the webhook test.");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Question sent to Matt" })).toBeVisible();

  const admin = adminClient();
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("intake_events").select("fibery_ref").eq("engagement_id", s.engagementId).eq("kind", "question_back");
        return data?.[0]?.fibery_ref ?? null;
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toMatch(/^H#\d+$/);
  const create = stub.calls.filter((c) => c.url === "/api/commands" && c.body.includes("fibery.entity/create")).pop()!;
  const entity = JSON.parse(create.body)[0].args.entity;
  expect(entity["Helm/Name"]).toBe("Coach question back: Launch menu v1 (sample)");
  expect(entity["Helm/Voyage"]).toEqual({ "fibery/id": "00000000-0000-4000-8000-000000000126" });
});
