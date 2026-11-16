// Fails if any tracked text file contains an em dash (U+2014). Rule 50.
import { execSync } from "node:child_process";
import fs from "node:fs";

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.startsWith("node_modules/") && !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|pdf|lock)$/.test(f))
  .filter((f) => f !== "package-lock.json" && fs.existsSync(f));
const EM = String.fromCharCode(0x2014);
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(EM)) hits.push(`${f}:${i + 1}`);
  });
}
if (hits.length) {
  console.error(`Em dash found in:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`No em dashes in ${files.length} files.`);
