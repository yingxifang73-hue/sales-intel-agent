import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:3000"
  }
});
