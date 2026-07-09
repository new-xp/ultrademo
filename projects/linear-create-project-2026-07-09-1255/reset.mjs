// Reset recipe for the Linear "create a project and tasks" flow.
// Deletes ONLY what the flow creates: the three issues, then the project
// (deleting a project does NOT cascade to its issues, so issues go first).
// Uses the same real-Chrome + real-keychain launch as the capture (see flow).
import {chromium} from 'playwright';
import path from 'node:path';

const context = await chromium.launchPersistentContext(path.resolve('.profiles', 'linear'), {
  channel: 'chrome',
  headless: true,
  viewport: {width: 1920, height: 1080},
  ignoreDefaultArgs: ['--use-mock-keychain'],
});
const page = context.pages()[0] ?? (await context.newPage());

const confirmIfAsked = async () => {
  const btn = page.locator('[role="dialog"] button:has-text("Delete")').last();
  if (await btn.waitFor({timeout: 3000}).then(() => true).catch(() => false)) {
    await btn.click();
  }
  await page.waitForTimeout(1500);
};

await page.goto('https://linear.app/acme2demo/projects/all', {waitUntil: 'domcontentloaded', timeout: 90000});
await page.waitForSelector(':text-is("My issues")', {timeout: 60000});
await page.waitForTimeout(3000);

const project = page.locator(':text("Website relaunch")').first();
if (await project.count()) {
  await project.click();
  await page.waitForURL(/\/project\//, {timeout: 30000});
  await page.waitForTimeout(2500);
  await page.locator(':text-is("Issues")').last().click();
  await page.waitForTimeout(2500);

  for (const title of ['Design the new homepage', 'Migrate the blog posts', 'Set up analytics events']) {
    for (let i = 0; i < 3; i++) {
      const row = page.locator(`:text("${title}")`).first();
      if (!(await row.count())) break;
      try {
        await row.click({button: 'right', timeout: 8000});
        const del = page.locator(':text-is("Delete")').last();
        await del.waitFor({timeout: 5000});
        await del.click();
        await confirmIfAsked();
        console.log(`deleted issue "${title}"`);
        break;
      } catch (e) {
        console.log(`retry issue "${title}": ${String(e).slice(0, 70)}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1500);
      }
    }
  }

  // delete the project from the projects list
  await page.goto('https://linear.app/acme2demo/projects/all', {waitUntil: 'domcontentloaded', timeout: 90000});
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) {
    const row = page.locator(':text("Website relaunch")').first();
    if (!(await row.count())) break;
    try {
      await row.click({button: 'right', timeout: 8000});
      const del = page.locator(':text-is("Delete")').last();
      await del.waitFor({timeout: 5000});
      await del.click();
      await confirmIfAsked();
      console.log('deleted project "Website relaunch"');
      break;
    } catch (e) {
      console.log(`retry project delete: ${String(e).slice(0, 70)}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1500);
    }
  }
}
console.log('reset complete');
await context.close();
