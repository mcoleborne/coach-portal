import { defineConfig, devices } from "@playwright/test";

/**
 * Limb (7): the scope's acceptance checks against the live production URL,
 * run as the test guest. Needs LIVE_URL, LIVE_GUEST_EMAIL,
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (repository secrets in CI).
 */
export default defineConfig({
  testDir: "./e2e-live",
  workers: 1,
  retries: 0,
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.LIVE_URL, trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
