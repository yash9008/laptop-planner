import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/app',
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: 'test-results',
});
