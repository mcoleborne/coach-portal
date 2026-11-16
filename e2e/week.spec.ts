import { expect, test } from "@playwright/test";
import { adminClient, seedEngagement } from "../tests/support/fixtures";
import { signInDirect } from "./helpers";
import { sydneyMonthKey } from "../lib/time/sydney";

test("this week shows the next session in Sydney time with its agenda and last session's actions", async ({ page }) => {
  const s = await seedEngagement({ label: "week" });
  await signInDirect(page, s.coachEmail);
  const week = page.getByTestId("this-week");
  await expect(page.getByTestId("next-session")).toHaveText(/^Session 3 · \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2}(am|pm) (AEDT|AEST) · 60 min$/);
  await expect(week.getByRole("link", { name: "Join call" })).toHaveAttribute("href", "https://example.test/call");
  await expect(page.getByTestId("agenda")).toContainText("Cart requirements sign-off");
  await expect(page.getByTestId("action-row")).toHaveCount(2);
  await expect(page.getByTestId("action-row").filter({ hasText: "Send three roaster samples" })).toContainText("Open");
});

test("the coach ticks their own action done", async ({ page }) => {
  const s = await seedEngagement({ label: "tick" });
  await signInDirect(page, s.coachEmail);
  const row = page.getByTestId("action-row").filter({ hasText: "Mark up cart workflow sketch" });
  await row.getByRole("button", { name: "Tick when done" }).click();
  await expect(row).toContainText("Done");
  // The owner's action has no tick for the coach.
  await expect(page.getByTestId("action-row").filter({ hasText: "roaster" }).getByRole("button")).toHaveCount(0);
  const { data } = await adminClient().from("intake_events").select("kind").eq("engagement_id", s.engagementId);
  expect(data).toEqual([{ kind: "action_ticked" }]);
});

test("the coach requests a reschedule with the 24-hour rule shown", async ({ page }) => {
  const s = await seedEngagement({ label: "resched" });
  await signInDirect(page, s.coachEmail);
  await expect(page.getByText("Moves inside 24 hours count as used")).toBeVisible();
  await page.getByRole("button", { name: "Request a reschedule" }).click();
  await expect(page.getByText(/less than 24 hours' notice, it comes off this month's sessions/)).toBeVisible();
  await page.getByLabel("When suits you instead? (optional)").fill("Sample: Thursday morning works");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByTestId("this-week")).toContainText("Reschedule requested. Matt will confirm a new time.");
  await expect(page.getByRole("button", { name: "Request a reschedule" })).toHaveCount(0);
  const { data } = await adminClient().from("sessions").select("status, reschedule_note").eq("id", s.sessionIds.next).single();
  expect(data).toEqual({ status: "reschedule_requested", reschedule_note: "Sample: Thursday morning works" });
});

test("the hours meter counts from data, a large review counting as two", async ({ page }) => {
  const s = await seedEngagement({ label: "hours" });
  await signInDirect(page, s.coachEmail);
  // The fixture's held session is 6 days ago, which is last month early in a Sydney month.
  const now = new Date();
  const heldThisMonth = sydneyMonthKey(new Date(now.getTime() - 6 * 86_400_000)) === sydneyMonthKey(now);
  await expect(page.getByTestId("hours-sessions")).toHaveText(heldThisMonth ? "1 of 4" : "0 of 4");
  await expect(page.getByTestId("hours-reviews")).toHaveText("0 of 8");
  await page.goto(`/cards/${s.cardIds[1]}`); // the large card
  await page.getByLabel(/B\. Cut to the top twenty/).check();
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByTestId("answer-summary")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("hours-reviews")).toHaveText("2 of 8");
});

test("the decision log lists each call with the coach's view and the source", async ({ page }) => {
  const s = await seedEngagement({ label: "log" });
  await adminClient().from("decisions").insert({
    engagement_id: s.engagementId,
    card_id: s.cardIds[0],
    question: "Venue plan: both floors (sample)",
    coach_view: "Sample view",
    decision: "Sample call",
  });
  await signInDirect(page, s.coachEmail);
  await expect(page.getByRole("region", { name: "Recent decisions" })).toContainText("Shortlist of three");
  await page.getByRole("link", { name: "Full decision log" }).click();
  await expect(page.getByRole("heading", { name: "Decision log" })).toBeVisible();
  const log = page.getByRole("region", { name: "Decision log" });
  await expect(log.getByText("Which roasters to sample? (sample)").locator("visible=true")).toBeVisible();
  await expect(log.getByRole("link", { name: "Review card" }).locator("visible=true")).toHaveAttribute("href", `/cards/${s.cardIds[0]}`);
  await expect(log.getByText("Session 2").locator("visible=true")).toBeVisible();
});
