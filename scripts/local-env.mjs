// Writes .env.local (or appends to $GITHUB_ENV in CI) from `supabase status -o env`.
// Values are the local stack's own throwaway keys. Nothing is printed.
import { execSync } from "node:child_process";
import fs from "node:fs";

const cli = process.env.SUPABASE_CLI ?? "supabase";
const raw = execSync(`${cli} status -o env`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const get = (k) => {
  const m = raw.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, "m"));
  return m ? m[1] : "";
};
const vars = {
  NEXT_PUBLIC_SUPABASE_URL: get("API_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: get("PUBLISHABLE_KEY") || get("ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: get("SECRET_KEY") || get("SERVICE_ROLE_KEY"),
  MAILPIT_URL: get("MAILPIT_URL") || get("INBUCKET_URL"),
  APP_URL: "http://127.0.0.1:3000",
  CLAUDE_SERVICE_TOKEN: "local-test-token-not-a-secret",
  CRON_SECRET: "local-cron-secret-not-a-secret",
};
const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing from supabase status: ${missing.join(", ")}`);
  process.exit(1);
}
const body = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, body);
fs.writeFileSync(".env.local", body);
console.log(`wrote ${Object.keys(vars).join(", ")}`);
