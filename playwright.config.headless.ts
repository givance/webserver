import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Override the base config to force headless mode
export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    headless: true, // Force headless mode
  },
});