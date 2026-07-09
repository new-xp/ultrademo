// "Create a project and tasks in Linear" - sample tutorial video #3.
// Captured against the acme2demo dummy workspace. Script gate waived by Sud
// 2026-07-09 ("don't wait for my approval, generate the finalized videos").
//
// AUTH (the hard-won part): Linear's human-verification rejects EVERY
// automated browser (bundled Chromium, real Chrome via Playwright, even a
// fresh profile - CDP is detected) AND magic links are bound to the browser
// that requested them. The working recipe:
//   1. open -na "Google Chrome" --args --user-data-dir=<abs .profiles/linear>
//      --no-first-run https://linear.app/login   (NO automation attached)
//   2. user signs in by hand (email code), quits Chrome CLEANLY (Cmd+Q -
//      killing the process loses the just-written cookies)
//   3. capture reuses the profile with channel:'chrome' + realKeychain:true
//      (Playwright's default mock keychain cannot decrypt cookies written by
//      a real-keychain Chrome)
//
// Linear gotchas (scouted live 2026-07-09):
// - Keyboard chords are the product: N then P = new project, C = new issue.
// - The create-project toast ("View project") auto-dismisses - click it in
//   the SAME scene as the create.
// - The new-issue dialog pre-fills the project when opened from the project
//   page; "Create more" keeps the dialog open between issues.
// - Issue rows: single click OPENS the issue - use right-click context menu
//   for properties (Priority submenu) and Delete (confirm dialog follows).
// - Deleting a project does NOT delete its issues - reset deletes issues
//   first, then the project.

const HUD = `(() => {
  const install = () => {
    if (window.__ud) return;
    const S = document.createElement('style');
    S.textContent =
      '#ud-keys{position:fixed;left:50%;bottom:280px;transform:translateX(-50%);display:flex;gap:16px;align-items:center;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .22s}' +
      '#ud-keys.on{opacity:1}' +
      '.ud-cap{font:600 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#15181e;background:linear-gradient(#ffffff,#e7e9ee);border:1px solid #c3c7d1;border-bottom:5px solid #a9aebc;border-radius:14px;padding:16px 26px;box-shadow:0 10px 28px rgba(0,0,0,.35);min-width:34px;text-align:center}' +
      '.ud-then{font:500 20px/1 -apple-system,sans-serif;color:#555;text-shadow:0 1px 6px rgba(255,255,255,.8)}';
    document.documentElement.appendChild(S);
    const keys = document.createElement('div'); keys.id = 'ud-keys';
    document.documentElement.append(keys);
    let hideT = null;
    const showKeys = (parts, holdMs) => {
      keys.innerHTML = '';
      parts.forEach((p, i) => {
        if (i) { const t = document.createElement('span'); t.className = 'ud-then'; t.textContent = 'then'; keys.appendChild(t); }
        const c = document.createElement('span'); c.className = 'ud-cap'; c.textContent = p; keys.appendChild(c);
      });
      keys.classList.add('on');
      clearTimeout(hideT);
      hideT = setTimeout(() => keys.classList.remove('on'), holdMs || 1500);
    };
    window.__ud = {
      key: (k, hold) => showKeys([k], hold),
      chord: (a, b, hold) => showKeys([a, b], hold),
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();`;

const BASE = 'https://linear.app/acme2demo';
const ud = (page, call) => page.evaluate(call).catch(() => {});

export default {
  title: 'Create a project and tasks in Linear',
  template: 'walkthrough',
  colorScheme: 'light',
  profile: 'linear',
  channel: 'chrome',
  realKeychain: true,
  inject: HUD,

  setup: async (page) => {
    await page.goto(`${BASE}/`, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector(':text-is("My issues")', {timeout: 60000});
    await page.waitForTimeout(2500);
  },

  scenes: [
    {
      id: 's1-hook',
      script: "This is Linear. Let's set up a new piece of work properly: a project, with its first tasks, almost entirely from the keyboard.",
      durationHint: 8,
    },

    {
      id: 's2-project',
      media: 'clip',
      script: "Press N, then P. Name the project, create, and one click on the toast puts you inside the project's new home.",
      record: async (page, rec) => {
        await ud(page, "__ud.chord('N', 'P', 1600)");
        await rec.pause(500);
        await page.keyboard.press('n');
        await rec.pause(280);
        await page.keyboard.press('p');
        await rec.skipWhile(() => page.waitForSelector('[role="dialog"]', {timeout: 15000}));
        await rec.pause(700);
        await page.keyboard.type('Website relaunch', {delay: 85});
        await rec.pause(700);
        await rec.click('[role="dialog"] button:has-text("Create project")');
        // the success toast auto-dismisses - get to its View project link quickly
        await rec.skipWhile(() => page.waitForSelector(':text("View project")', {timeout: 15000}));
        await rec.pause(600);
        await rec.click(':text("View project")');
        await rec.skipWhile(() =>
          page
            .waitForURL(/\/project\/.+\/overview/, {timeout: 60000, waitUntil: 'domcontentloaded'})
            .then(() => page.waitForSelector(':text-is("Properties")', {timeout: 30000}))
            .then(() => page.waitForTimeout(800)),
        );
        await rec.pause(1200);
      },
      durationHint: 11,
    },

    {
      id: 's3-overview',
      script: 'Properties, milestones, progress, and an activity feed. The project has a real home from day one.',
      target: ':text-is("Milestones")',
      action: 'none',
      zoom: 1.25,
      durationHint: 7,
    },

    {
      id: 's4-tasks',
      media: 'clip',
      script: "Now the tasks. Press C - the new task is already linked to the project. Flip on Create more, and you can pour in the whole backlog without the dialog ever closing.",
      record: async (page, rec) => {
        await rec.click(':text-is("Issues") >> nth=-1'); // the project's Issues tab
        await rec.skipWhile(() => page.waitForURL(/\/project\/.+\/issues/, {timeout: 30000}).then(() => page.waitForTimeout(700)));
        await rec.pause(600);
        await ud(page, "__ud.key('C', 1500)");
        await rec.pause(400);
        await page.keyboard.press('c');
        await rec.skipWhile(() => page.waitForSelector('[role="dialog"]', {timeout: 15000}));
        await rec.pause(600);
        await page.keyboard.type('Design the new homepage', {delay: 70});
        await rec.pause(500);
        await rec.click('[role="dialog"] :text("Create more")');
        await rec.pause(500);
        await rec.click('[role="dialog"] button:has-text("Create issue")');
        await rec.pause(1000);
        await page.keyboard.type('Migrate the blog posts', {delay: 70});
        await rec.pause(400);
        await rec.click('[role="dialog"] button:has-text("Create issue")');
        await rec.pause(1000);
        await page.keyboard.type('Set up analytics events', {delay: 70});
        await rec.pause(400);
        await rec.click('[role="dialog"] button:has-text("Create issue")');
        await rec.pause(800);
        await page.keyboard.press('Escape');
        await rec.pause(1000);
      },
      durationHint: 16,
    },

    {
      id: 's5-priority',
      media: 'clip',
      script: 'Properties are a keypress away. Hover the big task, tap P, and give it a high priority.',
      record: async (page, rec) => {
        // Linear's keyboard idiom: shortcuts act on the hovered issue row.
        // (A right-click menu exists too, but its "Priority" text collides
        // with the Properties panel label - the shortcut is cleaner.)
        await rec.moveTo(':text("Design the new homepage")');
        await rec.pause(600);
        await ud(page, "__ud.key('P', 1500)");
        await rec.pause(400);
        await page.keyboard.press('p');
        await rec.skipWhile(() => page.waitForSelector(':text-is("High")', {timeout: 10000}));
        await rec.pause(900);
        await rec.click(':text-is("High")');
        await rec.pause(1500);
      },
      durationHint: 8,
    },

    {
      id: 's6-outro',
      script: 'A project, a backlog, priorities set, in about a minute. This video was made with Ultrademo. Point your AI at any app and get a narrated walkthrough like this one.',
      prepare: async (page) => {
        // end on the project overview with progress reflecting the new scope
        await page.locator(':text-is("Overview")').last().click();
        await page.waitForSelector(':text-is("Properties")', {timeout: 30000});
        await page.waitForTimeout(1500);
      },
      durationHint: 10,
    },
  ],
};
