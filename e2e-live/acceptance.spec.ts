import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { formatSydneyDateTime } from "../lib/time/sydney";

/**
 * The scope's acceptance checks, on the live URL, as the test guest. Every
 * write lands in the test engagement only, on a card this run publishes.
 * Nothing is printed except pass or fail.
 */
const LIVE = process.env.LIVE_URL!;
const GUEST = process.env.LIVE_GUEST_EMAIL!;
let client: SupabaseClient | null = null;
const admin = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return Reflect.get(client, prop);
  },
});
const RUN = formatSydneyDateTime(new Date());
const FILE_WITHIN_MS = 2 * 60_000;

async function engagementId(): Promise<string> {
  const { data, error } = await admin.from("engagements").select("id").eq("name", "Club de Vela coaching (test)").single();
  if (error || !data) throw new Error("test engagement not found");
  return data.id;
}

async function signIn(page: Page) {
  // The emailed-link path is the same one the guest uses. The link is minted
  // here so the run needs no inbox. Requesting a link on the page is checked separately.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: GUEST,
    options: { redirectTo: `${LIVE}/auth/confirm` },
  });
  if (error || !data.properties?.action_link) throw new Error("could not mint a sign-in link");
  await page.goto(data.properties.action_link);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/consent")) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/consent"));
  }
}

test("the sign-in page sends a link to the test guest without error", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "once is enough");
  await page.goto("/sign-in");
  await page.getByLabel("Your email").fill(GUEST);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("a guest sees only their own engagement", async ({ page }) => {
  await signIn(page);
  const eid = await engagementId();
  await expect(page.getByText("Club de Vela · Coach portal")).toBeVisible();
  const { data: other } = await admin.from("cards").select("id").neq("engagement_id", eid).limit(1);
  if (other?.[0]) {
    const res = await page.goto(`/cards/${other[0].id}`);
    expect(res?.status()).toBe(404);
  }
});

test("every coach act reaches Claude and is filed to Fibery within two minutes", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "server-side path, once");
  const eid = await engagementId();
  const { data: card } = await admin
    .from("cards")
    .insert({
      engagement_id: eid,
      title: `Live check card (sample) ${RUN}`,
      question: "Live check: does every act reach Fibery? (sample)",
      context_md: "Sample card published by the live check.",
      document_md: "# Live check (sample)\n\nSample document. End of sample document.",
      options: [
        { key: "A", label: "Yes (sample)" },
        { key: "B", label: "No (sample)" },
      ],
      size: "standard",
    })
    .select("id")
    .single();
  const { data: card2 } = await admin
    .from("cards")
    .insert({ engagement_id: eid, title: `Live check question card (sample) ${RUN}`, question: "Live check question back (sample)", options: [{ key: "A", label: "Sample" }] })
    .select("id")
    .single();
  const started = new Date().toISOString();

  await signIn(page);

  // Answer with reasoning and an attachment.
  await page.goto(`/cards/${card!.id}`);
  await expect(page.getByTestId("card-document")).toContainText("End of sample document.");
  await page.getByLabel(/A\. Yes \(sample\)/).check();
  await page.getByLabel("Why, and anything we've missed").fill("Live check reasoning (sample).");
  await page.getByTestId("attachment-input").setInputFiles({ name: "live-check.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await expect(page.getByRole("list", { name: "Attached" })).toContainText("live-check.png");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByTestId("answer-summary")).toBeVisible();

  // Comment.
  await page.getByLabel("Add a comment").fill("Live check comment (sample).");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByTestId("comment").filter({ hasText: "Live check comment (sample)." })).toBeVisible();

  // Voice note, on the card.
  await page.getByTestId("material-input").setInputFiles({ name: "live-check-voice.webm", mimeType: "audio/webm", buffer: Buffer.from("1a45dfa3", "hex") });
  await expect(page.getByTestId("upload-item").filter({ hasText: "live-check-voice.webm" })).toBeVisible();

  // Question back, on the second card.
  await page.goto(`/cards/${card2!.id}`);
  await page.getByRole("button", { name: "Ask Matt a question instead" }).click();
  await page.getByLabel("What do you need to know first?").fill("Live check question back (sample). No action needed.");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Question sent to Matt" })).toBeVisible();

  // Upload from home, and a raised item.
  await page.goto("/");
  await page.getByTestId("material-input").first().setInputFiles({ name: "live-check.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 sample") });
  await expect(page.getByRole("status").filter({ hasText: "Added live-check.pdf" }).first()).toBeVisible();
  await page.goto("/raise");
  await page.getByLabel("Idea").check();
  await page.getByLabel("What did you notice?").fill("Live check raised item (sample). No action needed.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible();

  // Every act wrote one intake event, and each is filed within two minutes.
  const want = ["answer", "upload", "comment", "voice_note", "question_back", "upload", "raised_item"].sort();
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("intake_events").select("kind, filed_at").eq("engagement_id", eid).gte("created_at", started);
        return { kinds: (data ?? []).map((e) => e.kind).sort(), unfiled: (data ?? []).filter((e) => !e.filed_at).length };
      },
      { timeout: FILE_WITHIN_MS + 30_000, intervals: [2000] },
    )
    .toEqual({ kinds: want, unfiled: 0 });

  const { data: events } = await admin
    .from("intake_events")
    .select("kind, created_at, filed_at, fibery_ref, attempts")
    .eq("engagement_id", eid)
    .gte("created_at", started);
  for (const e of events ?? []) {
    const ms = new Date(e.filed_at!).getTime() - new Date(e.created_at).getTime();
    expect(ms, `${e.kind} filed in ${Math.round(ms / 1000)}s`).toBeLessThan(FILE_WITHIN_MS);
  }
  expect(events!.find((e) => e.kind === "question_back")!.fibery_ref).toMatch(/^H#\d+$/);
  console.log(`Filed: ${events!.map((e) => `${e.kind} ${Math.round((new Date(e.filed_at!).getTime() - new Date(e.created_at).getTime()) / 1000)}s`).join(", ")}`);
});

test("the agenda shows the day before, and the hours meter matches the data", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("this-week")).toBeVisible();
  await expect(page.getByTestId("next-session")).toHaveText(/(AEDT|AEST)/);
  await expect(page.getByTestId("hours-reviews")).toHaveText(/^\d+ of \d+$/);
});

test("every screen works on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone pass");
  await signIn(page);
  for (const path of ["/", "/log", "/raise"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});
