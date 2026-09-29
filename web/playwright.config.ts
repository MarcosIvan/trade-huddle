import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real static export (with its Content Security
 * Policy), served like GitHub Pages. Build first with the same base path:
 *   NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run build
 *   NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run test:e2e
 * Sleeper's API is mocked in every test; nothing leaves the machine.
 */
const PORT = 4173;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}/`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/serve-out.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
