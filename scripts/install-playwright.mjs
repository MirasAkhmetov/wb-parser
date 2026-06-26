import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL) {
  console.log("Vercel: используется @sparticuz/chromium, установка Playwright пропущена.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browsersPath = path.join(root, ".playwright-browsers");

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

console.log("Installing Playwright Chromium to:", browsersPath);

try {
  execSync("npx playwright install chromium", {
    stdio: "inherit",
    env: process.env,
    cwd: root,
  });
} catch {
  console.log("Chromium install skipped. The app will use Chrome or Edge if installed.");
}
