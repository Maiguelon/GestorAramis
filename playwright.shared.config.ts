import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/shared-ui', fullyParallel: true, retries: 0, timeout: 30_000,
  reporter: [['list']], use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'shared-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode test-shared --host 127.0.0.1 --port 5175',
    url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 30_000,
    env: { VITE_APP_MODE: 'shared', VITE_SUPABASE_URL: 'https://shared-ui-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_FAKE_BROWSER_TEST_ONLY', VITE_API_BASE_URL: '/api' },
  },
});
