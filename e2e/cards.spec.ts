import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";

test("a card renders its document in full and offers a PDF", async ({ page }) => {
  const s = await seedEngagement({ label: "card-doc" });
  await signInDirect(page, s.coachEmail);
  await page.getByRole("link", { name: /Cart requirements v1\.0 \(sample\)/ }).click();
  await expect(page.getByText("THE QUESTION")).toBeVisible();
  await expect(page.getByText("Do three carts cover a packed summer Saturday")).toBeVisible();

  // The whole document is in the card: the last line of the last section is there.
  const doc = page.getByTestId("card-document");
  await expect(doc).toContainText("End of sample document.");
  await expect(doc.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Show the full document" }).click();
  await expect(doc.getByText("End of sample document.")).toBeVisible();

  const pdf = await page.request.get(`/cards/${s.cardIds[0]}/document.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Opening the card is recorded for the activity list.
  await expect(page.getByText(/Opened by Test guest/)).toBeVisible();
});

test("the coach answers with an option, reasoning and an attachment", async ({ page }) => {
  const s = await seedEngagement({ label: "card-answer" });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[0]}`);

  await page.getByLabel(/C\. Three carts now/).check();
  await page.getByLabel("Why, and anything we've missed").fill("Sample reasoning: keep room for a fourth cart.");
  await page.getByTestId("attachment-input").setInputFiles({
    name: "cart-sketch.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await expect(page.getByRole("list", { name: "Attached" })).toContainText("cart-sketch.png");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByTestId("answer-summary")).toContainText("Three carts now");
  await expect(page.getByTestId("answer-summary")).toContainText("Claude files it within a minute");

  const admin = adminClient();
  const { data: card } = await admin.from("cards").select("status, answered_at").eq("id", s.cardIds[0]).single();
  expect(card?.status).toBe("answered");
  expect(card?.answered_at).not.toBeNull();
  const { data: answers } = await admin.from("answers").select("id, option_key, reasoning_md").eq("card_id", s.cardIds[0]);
  expect(answers).toHaveLength(1);
  expect(answers![0].option_key).toBe("C");
  const { data: uploads } = await admin.from("uploads").select("answer_id, kind, file_name").eq("card_id", s.cardIds[0]);
  expect(uploads).toEqual([{ answer_id: answers![0].id, kind: "photo", file_name: "cart-sketch.png" }]);

  await page.reload();
  await expect(page.getByTestId("answer-summary")).toContainText("Three carts now");
  await page.goto("/?status=answered");
  await expect(page.getByRole("link", { name: /Cart requirements v1\.0 \(sample\)/ })).toBeVisible();
});

test("the coach sends a question back to the owner instead of answering", async ({ page }) => {
  const s = await seedEngagement({ label: "card-question" });
  await signInDirect(page, s.coachEmail);
  await page.goto(`/cards/${s.cardIds[1]}`);
  await page.getByRole("button", { name: "Ask Matt a question instead" }).click();
  await page.getByLabel("What do you need to know first?").fill("Sample question: what is the food cost target?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Question sent to Matt" })).toBeVisible();

  const admin = adminClient();
  const { data: card } = await admin.from("cards").select("status").eq("id", s.cardIds[1]).single();
  expect(card?.status).toBe("question_back");
  const { data: comments } = await admin.from("comments").select("is_question_back, body_md").eq("card_id", s.cardIds[1]);
  expect(comments).toEqual([{ is_question_back: true, body_md: "Sample question: what is the food cost target?" }]);
});

test("a second guest cannot open the first guest's card", async ({ page }) => {
  const a = await seedEngagement({ label: "card-rls-a" });
  const b = await seedEngagement({ label: "card-rls-b" });
  await signInDirect(page, b.coachEmail);
  const res = await page.goto(`/cards/${a.cardIds[0]}`);
  expect(res?.status()).toBe(404);
  const pdf = await page.request.get(`/cards/${a.cardIds[0]}/document.pdf`);
  expect(pdf.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByText("Cart requirements v1.0 (sample)")).toHaveCount(1); // only their own
});
