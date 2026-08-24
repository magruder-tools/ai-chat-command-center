import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173`,
    port: 4173,
    reuseExistingServer: true,
    timeout: 20_000
  }
});
