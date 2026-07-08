// Reset the Notion demo workspace so the tracker flow can re-run: moves every
// sidebar page named "Project Tracker" (the demo creates a page + a database
// with that name each take) to Trash, handling the confirmation dialog.
// Leaves everything else (Demo Stage, Welcome to Notion, To Do List) alone.
//
// Usage: node capture/reset-notion-demo.mjs

import {chromium} from 'playwright';

const HOME = 'https://app.notion.com/p/39787baed58180b0933ddadc5bdce66f';

const ctx = await chromium.launchPersistentContext('.profiles/notion', {
  headless: true,
  viewport: {width: 1920, height: 1080},
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

for (let round = 0; round < 5; round++) {
  await page.goto(HOME);
  await page.waitForTimeout(3000);
  const href = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('nav a')).find(
      (a) => a.textContent.trim().replace(/\s+/g, ' ') === 'Project Tracker',
    );
    return a ? a.getAttribute('href') : null;
  });
  if (!href) {
    console.log('no Project Tracker pages left - workspace clean');
    break;
  }
  await page.goto(`https://app.notion.com${href}`);
  await page.waitForTimeout(2500);
  await page.locator('[aria-label="Actions"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('.notion-overlay-container').getByText('Move to Trash', {exact: true}).click();
  await page.waitForTimeout(1000);
  const confirm = page
    .locator('.notion-overlay-container')
    .getByText('Move to Trash', {exact: true})
    .last();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(1500);
  }
  console.log(`trashed ${href}`);
}

await ctx.close();
