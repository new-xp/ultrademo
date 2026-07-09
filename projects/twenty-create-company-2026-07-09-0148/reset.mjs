// Reset recipe for the Twenty "create a company record" flow.
// Deletes ONLY the records this flow creates (Pied Piper / Richard Hendricks /
// the follow-up task) so the capture is re-runnable. Twenty's right-click
// "Delete ..." context-menu action is immediate (no confirm dialog).
import {chromium} from 'playwright';
import path from 'node:path';

const BASE = 'https://acmedemo.twenty.com';
const context = await chromium.launchPersistentContext(path.resolve('.profiles', 'twenty'), {
  headless: true,
  viewport: {width: 1920, height: 1080},
});
const page = context.pages()[0] ?? (await context.newPage());

const deleteRows = async (listUrl, rowText) => {
  await page.goto(`${BASE}${listUrl}`, {waitUntil: 'domcontentloaded', timeout: 90000});
  await page.waitForSelector('[data-testid^="row-id-"], :text("Add New")', {timeout: 60000}).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) {
    try {
      const row = page.locator(`[data-testid^="row-id-"]:has-text(${JSON.stringify(rowText)})`).first();
      if (!(await row.count())) break;
      // the context menu only opens from a FILLED cell, not the row container
      // or an empty cell - walk the cells until the menu shows up
      const cells = row.locator('[data-testid="editable-cell-display-mode"]');
      const cellCount = await cells.count();
      let deleted = false;
      for (let c = 0; c < cellCount && !deleted; c++) {
        await cells.nth(c).click({button: 'right', timeout: 8000});
        const del = page.locator('div:text-matches("^Delete ")').last();
        if (await del.waitFor({timeout: 3000}).then(() => true).catch(() => false)) {
          await del.click();
          await page.waitForTimeout(2000); // let the table re-render settle
          console.log(`deleted "${rowText}" from ${listUrl}`);
          deleted = true;
        } else {
          await page.keyboard.press('Escape');
        }
      }
      if (!deleted) throw new Error(`no delete menu for "${rowText}" on ${listUrl}`);
    } catch (e) {
      // the table re-renders under us after each delete - re-locate and retry
      console.log(`retrying after: ${String(e).slice(0, 80)}`);
      await page.waitForTimeout(2000);
    }
  }
};

// Soft-deleted records still hold their field values and Twenty's dedupe
// counts them ("This record already exists" when the next take types the same
// domain), so after soft-deleting we permanently destroy our artifacts via the
// "Deleted at" filter view.
const destroyDeleted = async (listUrl, rowText) => {
  await page.goto(`${BASE}${listUrl}`, {waitUntil: 'domcontentloaded', timeout: 90000});
  await page.waitForSelector('[data-testid^="row-id-"], :text("Add New")', {timeout: 60000}).catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Filter"):visible').first().click();
  await page.waitForTimeout(800);
  await page.locator(':text-is("Deleted at")').last().click();
  await page.waitForTimeout(2000);
  for (let i = 0; i < 12; i++) {
    try {
      const row = page.locator(`[data-testid^="row-id-"]:has-text(${JSON.stringify(rowText)})`).first();
      if (!(await row.count())) break;
      await row.locator('[data-testid="editable-cell-display-mode"]').first().click({button: 'right', timeout: 8000});
      const destroy = page.locator('div:text-matches("^Permanently destroy ")').last();
      await destroy.waitFor({timeout: 5000});
      await destroy.click();
      await page.waitForTimeout(800);
      // confirm dialog, if any
      const confirm = page.locator('button:has-text("destroy"):visible, button:has-text("Destroy"):visible').last();
      if (await confirm.count()) {
        await confirm.click().catch(() => {});
      }
      await page.waitForTimeout(2000);
      console.log(`destroyed "${rowText}" from ${listUrl} deleted view`);
    } catch (e) {
      console.log(`retrying destroy after: ${String(e).slice(0, 80)}`);
      await page.waitForTimeout(2000);
    }
  }
};

await deleteRows('/objects/tasks', 'Send intro deck to Richard');
await deleteRows('/objects/people', 'Richard Hendricks');
await deleteRows('/objects/companies', 'Pied Piper');
await destroyDeleted('/objects/companies', 'Pied Piper');
await destroyDeleted('/objects/people', 'Richard Hendricks');
await destroyDeleted('/objects/tasks', 'Send intro deck to Richard');
console.log('reset complete');
await context.close();
