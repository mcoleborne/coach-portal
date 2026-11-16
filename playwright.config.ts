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
    command: "npm run start -- -H 127.0.0.1 -p 3000",
    url: `${BASE}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The local stack's keys win over anything in the shell.
    env: { ...local, NODE_ENV: "production" },
  },
});
