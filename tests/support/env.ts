import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env.local for local test runs and lets it win over the shell, so a
 * test can never reach a real project because a real key is in the shell.
 * In CI the workflow writes the same file from the local stack.
 */
export function readLocalEnv(): Record<string, string> {
  const file = path.resolve(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function loadEnv() {
  Object.assign(process.env, readLocalEnv());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error("Tests run only against a local Supabase stack (127.0.0.1).");
  }
}
