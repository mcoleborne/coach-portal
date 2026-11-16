import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";

test("the coach raises a risk with a photo and asks for it on the agenda", async ({ page }) => {
  const s = await seedEngagement({ label: "raise" });
  await signInDirect(page, s.coachEmail);
  await page.getByRole("link", { name: "Raise something" }).first().click();
  await expect(page.getByRole("heading", { name: "Raise something" })).toBeVisible();
  await page.getByLabel("Risk").check();
  await page.getByLabel("What did you notice?").fill("Sample: the cool room door seal is failing.");
  await page.getByTestId("attachment-input").setInputFiles({ name: "seal.jpg", mimeType: "image/jpeg", buffer: Buffer.from("ffd8ffe0", "hex") });
  await expect(page.getByRole("list", { name: "Attached" })).toContainText("seal.jpg");
  await page.getByLabel("Put it on this week's agenda").check();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible();

  const admin = adminClient();
  const { data: items } = await admin.from("raised_items").select("id, kind, body_md, add_to_agenda").eq("engagement_id", s.engagementId);
  expect(items).toEqual([{ id: expect.any(String), kind: "risk", body_md: "Sample: the cool room door seal is failing.", add_to_agenda: true }]);
  const { data: uploads } = await admin.from("uploads").select("raised_item_id, kind").eq("engagement_id", s.engagementId);
  expect(uploads).toEqual([{ raised_item_id: items![0].id, kind: "photo" }]);
  const { data: events } = await admin.from("intake_events").select("kind").eq("engagement_id", s.engagementId);
  expect(events!.map((e) => e.kind).sort()).toEqual(["raised_item", "upload"]);
});

test("an empty queue shows a clear nothing-waiting state", async ({ page }) => {
  const s = await seedEngagement({ label: "empty", withCards: false });
  await signInDirect(page, s.coachEmail);
  const empty = page.getByTestId("empty-queue");
  await expect(empty).toContainText("Nothing waiting on you");
  await expect(empty).toContainText("You're all caught up. New reviews arrive by email and appear here.");
  await expect(empty.getByRole("link", { name: "Raise something" })).toHaveAttribute("href", "/raise");
  // This week still shows above it.
  await expect(page.getByTestId("next-session")).toBeVisible();
});

test("the owner sees the coach's empty queue in their own words", async ({ page }) => {
  const s = await seedEngagement({ label: "empty-owner", withCards: false });
  await signInDirect(page, s.ownerEmail);
  await expect(page.getByTestId("empty-queue")).toContainText("Nothing waiting on Test guest");
});
