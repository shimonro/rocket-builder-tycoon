import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /touch/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /touch/ },
  ],
  webServer: {
    // Builds against a fake Supabase project that e2e/supabaseMock.ts answers, so login flows run offline.
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    env: { VITE_SUPABASE_URL: 'https://e2e.supabase.test', VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' },
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
