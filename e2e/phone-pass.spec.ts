import { expect, test, type Page } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";

/**
 * Every screen at 390px wide: nothing scrolls sideways, and every control a
 * thumb uses is at least 44px tall. Text links inside rendered documents and
 * sentences are exempt, as WCAG 2.5.8 exempts inline targets.
 */
async function checkPhoneScreen(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${name}: page scrolls sideways`).toBeLessThanOrEqual(390);

  const small = await page.evaluate(() => {
    const out: string[] = [];
    const targets = document.querySelectorAll<HTMLElement>(
      "button, a[href], input:not([type=hidden]), textarea, select, summary",
    );
    for (const el of targets) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("[hidden]")) continue;
      if (el.closest(".prose-doc")) continue; // links inside rendered documents
      if ((el as HTMLInputElement).type === "file") continue;
      // A radio or checkbox counts by its label, which is the touch target.
      const target = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox") ? (el.closest("label") ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || (el as HTMLInputElement).name || "").trim().slice(0, 40)}" ${Math.round(r.height)}px`);
    }
    return out;
  });
  expect(small, `${name}: touch targets under 44px`).toEqual([]);
}

test("every screen works at 390px wide with 44px touch targets", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone pass");
  const s = await seedEngagement({ label: "phone" });
  const admin = adminClient();
  await admin.from("comments").insert({ card_id: s.cardIds[0], author_kind: "claude", body_md: "Sample comment from Claude." });
  await admin.from("uploads").insert({
    engagement_id: s.engagementId,
    card_id: s.cardIds[0],
    storage_path: `${s.engagementId}/p/menu.pdf`,
    file_name: "A long sample file name for the menu he likes.pdf",
    kind: "pdf",
  });

  // 5. Sign in
  await page.goto("/sign-in");
  await checkPhoneScreen(page, "sign in");

  // First sign-in consent
  await signInDirect(page, s.coachEmail, { answerConsent: false });
  await expect(page).toHaveURL(/\/consent$/);
  await checkPhoneScreen(page, "consent");
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Phone home
  await expect(page.getByTestId("this-week")).toBeVisible();
  await checkPhoneScreen(page, "home");
  await expect(page.getByRole("navigation", { name: "Quick actions" })).toBeVisible();

  // 6. Phone card answer
  await page.goto(`/cards/${s.cardIds[0]}`);
  await checkPhoneScreen(page, "card");
  await page.getByRole("button", { name: "Ask Matt a question instead" }).click();
  await checkPhoneScreen(page, "card, question back");

  // 3. Decision log and uploads
  await page.goto("/log");
  await checkPhoneScreen(page, "log");

  // 7. Raise something
  await page.goto("/raise");
  await checkPhoneScreen(page, "raise");

  // Home with the reschedule form open
  await page.goto("/");
  await page.getByRole("button", { name: "Request a reschedule" }).click();
  await checkPhoneScreen(page, "home, reschedule");

  // 8. Nothing waiting
  const empty = await seedEngagement({ label: "phone-empty", withCards: false });
  await page.context().clearCookies();
  await signInDirect(page, empty.coachEmail);
  await expect(page.getByTestId("empty-queue")).toBeVisible();
  await checkPhoneScreen(page, "nothing waiting");
});
