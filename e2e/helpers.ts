import { expect, type Page } from "@playwright/test";
import { loadEnv } from "../tests/support/env";
import { adminClient } from "../tests/support/fixtures";

loadEnv();

/** Polls the local mail catcher for the newest sign-in link sent to an address. */
export async function latestSignInLink(email: string, since: number): Promise<string> {
  const base = process.env.MAILPIT_URL!;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const msg = (body.messages ?? []).find((m) => new Date(m.Created).getTime() >= since - 2000);
    if (msg) {
      const full = (await (await fetch(`${base}/api/v1/message/${msg.ID}`)).json()) as { Text?: string; HTML?: string };
      const text = `${full.Text ?? ""} ${(full.HTML ?? "").replace(/&amp;/g, "&")}`;
      const m = /(http[^\s"'<>)]+\/auth\/v1\/verify[^\s"'<>)]+)/.exec(text);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email arrived for ${email}`);
}

/** The full path a person takes: ask for a link, open the email, tap the link. */
export async function signInByEmail(page: Page, email: string) {
  const since = Date.now();
  await page.goto("/sign-in");
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const link = await latestSignInLink(email, since);
  await page.goto(link);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 20_000 });
}

/** Faster sign-in for tests about other things: a one-time link minted locally, no email. */
export async function signInDirect(page: Page, email: string, opts: { answerConsent?: boolean } = {}) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://127.0.0.1:3000/auth/confirm" },
  });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  await page.goto(data.properties.action_link);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 20_000 });
  if (opts.answerConsent !== false && page.url().includes("/consent")) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/consent"));
  }
}
