import { defineConfig, devices } from "@playwright/test";
import { readLocalEnv } from "./tests/support/env";

const local = readLocalEnv();
const BASE = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE, trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    // 0.0.0.0 so the local database container can reach the app (its webhook).
    command: "npm run start -- -H 0.0.0.0 -p 3000",
    url: `${BASE}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The local stack's keys win over anything in the shell.
    env: {
      ...local,
      NODE_ENV: "production",
      // Fibery and the routine endpoint are stubbed by e2e/stub-server.ts. Test values only.
      FIBERY_TOKEN: "e2e-fibery-token",
      FIBERY_WORKSPACE: "stub",
      FIBERY_BASE_URL: "http://127.0.0.1:4010",
      FIBERY_WIKI_PAGE_ID: "00000000-0000-4000-8000-000000000061",
      FIBERY_VOYAGE_ID: "00000000-0000-4000-8000-000000000126",
      FIBERY_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
      AG095_FIRE_URL: "http://127.0.0.1:4010/fire",
      AG095_FIRE_TOKEN: "e2e-routine-token",
    },
  },
});
