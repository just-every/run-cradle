import {chromium} from '@playwright/test';

// Use this checkout's bundled headless shell, real HOME and default launch args.
const browser = await chromium.launch({
  headless: true,
  timeout: 20_000,
  args: ['--use-mock-keychain', '--password-store=basic'],
});
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  if (await page.evaluate(() => 1 + 1) !== 2) throw Error('Chromium renderer probe failed');
  console.log('Chromium headless launch and renderer probe passed');
} finally {
  await browser.close();
}
