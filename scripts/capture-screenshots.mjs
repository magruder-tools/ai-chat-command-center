import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const port = 4173;
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: "ignore"
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/?demo=1`);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview server did not start.");
}

try {
  await waitForPreview();
  await mkdir("docs/screenshots", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?demo=1`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "docs/screenshots/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: /Archive 1/ }).click();
  await page.screenshot({ path: "docs/screenshots/archive.png", fullPage: true });
  await browser.close();
} finally {
  preview.kill("SIGTERM");
}
