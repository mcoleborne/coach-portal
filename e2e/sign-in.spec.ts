import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInByEmail, signInDirect } from "./helpers";

// Runs in both projects: desktop (1280 wide) and phone (390 wide, touch).
test("a guest signs in by an emailed link, answers consent once, and lands on home", async ({ page }) => {
  const seeded = await seedEngagement({ label: "signin" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);

  await signInByEmail(page, seeded.coachEmail);
  await expect(page).toHaveURL(/\/consent$/);
  await page.getByLabel("I'm comfortable with calls being recorded").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Club de Vela · Coach portal")).toBeVisible();

  const { data } = await adminClient()
    .from("engagements")
    .select("recording_consent_at")
    .eq("id", seeded.engagementId)
    .single();
  expect(data?.recording_consent_at).not.toBeNull();

  // Asked once: a fresh sign-in does not ask again.
  await page.context().clearCookies();
  await signInDirect(page, seeded.coachEmail, { answerConsent: false });
  await expect(page).toHaveURL(/\/$/);

  // The session lives in a cookie that lasts 30 days on this device.
  const cookies = await page.context().cookies();
  const auth = cookies.find((c) => c.name.includes("auth-token"));
  expect(auth).toBeTruthy();
  const days = (auth!.expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29);
});

test("an address with no engagement gets no account and no access", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Your email").fill("stranger@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Same message either way, so membership is not revealed.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  expect(data.users.find((u) => u.email === "stranger@example.test")).toBeUndefined();
});
