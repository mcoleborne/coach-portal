import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";

test("the coach comments on a card and the thread shows it", async ({ page }) => {
  const s = await seedEngagement({ label: "comment" });
  await adminClient()
    .from("comments")
    .insert({ card_id: s.cardIds[0], author_kind: "claude", body_md: "Sample: electric, because of the site rules." });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[0]}`);
  await expect(page.getByTestId("comment").first()).toContainText("Claude for Matt");

  await page.getByLabel("Add a comment").fill("Sample: is the grill cart gas or electric?");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByTestId("comment")).toHaveCount(2);
  await expect(page.getByTestId("comment").nth(1)).toContainText("Test guest");
  await expect(page.getByTestId("comment").nth(1)).toContainText("Sample: is the grill cart gas or electric?");
  await expect(page.getByLabel("Add a comment")).toHaveValue("");
});

test("material added from home lands in private storage and shows on the uploads page", async ({ page }) => {
  const s = await seedEngagement({ label: "upload" });
  await signInDirect(page, s.coachEmail);
  await page.goto("/");
  await page.getByTestId("material-input").first().setInputFiles({
    name: "supplier-list.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 sample"),
  });
  await expect(page.getByRole("status").filter({ hasText: "Added supplier-list.pdf" }).first()).toBeVisible();

  await page.goto("/log");
  const item = page.getByTestId("upload-item").filter({ hasText: "supplier-list.pdf" });
  await expect(item).toContainText("Test guest");
  // The link is a signed, expiring storage link, not a public one.
  const href = await item.getByRole("link").getAttribute("href");
  expect(href).toContain("/storage/v1/object/sign/uploads/");
  expect(href).toContain("token=");

  const { data } = await adminClient().from("uploads").select("kind, card_id, storage_path").eq("engagement_id", s.engagementId);
  expect(data).toHaveLength(1);
  expect(data![0].kind).toBe("pdf");
  expect(data![0].card_id).toBeNull();
  expect(data![0].storage_path.startsWith(`${s.engagementId}/`)).toBe(true);
});

test("a voice note attached to a card is stored as audio for transcription", async ({ page }) => {
  const s = await seedEngagement({ label: "voice" });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[2]}`);
  await page.getByTestId("material-input").setInputFiles({
    name: "voice-note.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("1a45dfa3", "hex"),
  });
  await expect(page.getByTestId("upload-item").filter({ hasText: "voice-note.webm" })).toContainText(
    "Transcript to follow",
  );
  const { data } = await adminClient().from("uploads").select("kind, card_id").eq("engagement_id", s.engagementId);
  expect(data).toEqual([{ kind: "audio", card_id: s.cardIds[2] }]);
});
