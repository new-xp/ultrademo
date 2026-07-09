// Auth handoff: opens a headed browser on a persistent Ultrademo profile so
// you can sign in to an app once (incl. SSO). The session persists to
// .profiles/<name>/ and headless captures reuse it via `profile: '<name>'`
// in the flow definition.
//
// Usage: npm run login -- <profile> <url>
// Sign in inside the window, then close the browser window to finish.

import {chromium} from 'playwright';
import path from 'node:path';

const [profile, url] = process.argv.slice(2);
if (!profile || !url) {
  console.error('Usage: npm run login -- <profile> <url>');
  process.exit(1);
}

const dir = path.resolve('.profiles', profile);
// Prefer the installed Google Chrome build: some sign-in flows (Linear's
// human-verification step, Google SSO) reject Playwright's bundled Chromium
// outright ("not secure" / "unable to verify you") but accept real Chrome
// with the human completing the check. Falls back to bundled Chromium when
// Chrome isn't installed.
const launch = (opts) =>
  chromium
    .launchPersistentContext(dir, {channel: 'chrome', ...opts})
    .catch(() => chromium.launchPersistentContext(dir, opts));
const context = await launch({
  headless: false,
  viewport: {width: 1440, height: 900},
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url);

console.log(`Sign in inside the opened window, then CLOSE the browser window to finish.`);
console.log(`(If a Google SSO login is blocked as "not secure", use the app's email/code login instead.)`);

await new Promise((resolve) => context.on('close', resolve));

// Verify the session actually persisted: reopen headless, load the same URL,
// and report what a capture would see. Catches sign-ins that silently failed
// (e.g. Google SSO blocking automated browsers).
console.log('Window closed - verifying the session headlessly...');
const check = await launch({
  headless: true,
  viewport: {width: 1920, height: 1080},
});
const checkPage = check.pages()[0] ?? (await check.newPage());
await checkPage.goto(url);
await checkPage.waitForLoadState('networkidle').catch(() => {});
await checkPage.waitForTimeout(3000);
const shot = path.resolve('.profiles', `${profile}-verify.png`);
await checkPage.screenshot({path: shot});
const preview = await checkPage.evaluate(() =>
  document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
);
await check.close();
console.log(`Headless capture would see: "${preview}"`);
console.log(`Screenshot: ${shot}`);
console.log(
  /sign in|log in|continue with/i.test(preview)
    ? '⚠ That looks like a login page - the session did NOT persist. Re-run npm run login and complete the sign-in inside the window (email/code login is most reliable).'
    : `✓ Session saved - captures can now use profile: '${profile}'.`,
);
