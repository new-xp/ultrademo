// "7 GitHub shortcuts you should be using" - sample tips video.
// Captured logged out (reproducible, nothing to redact). Script outline
// approved 2026-07-08 (product/2026-07-08-github-tips-script-outline.md).
//
// This flow uses `inject` to put a small HUD on camera: keycap callouts for
// the shortcut being pressed, and a live URL chip (real location.href) so
// URL-payoff scenes (permalink, .com -> .dev) are visible - Playwright never
// records the browser's own URL bar. The HUD only visualizes real events.

const HUD = `(() => {
  const install = () => {
    if (window.__ud) return;
    const S = document.createElement('style');
    S.textContent =
      '#ud-keys{position:fixed;left:50%;bottom:280px;transform:translateX(-50%);display:flex;gap:16px;align-items:center;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .22s}' +
      '#ud-keys.on{opacity:1}' +
      '.ud-cap{font:600 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#15181e;background:linear-gradient(#ffffff,#e7e9ee);border:1px solid #c3c7d1;border-bottom:5px solid #a9aebc;border-radius:14px;padding:16px 26px;box-shadow:0 10px 28px rgba(0,0,0,.35);min-width:34px;text-align:center}' +
      '.ud-then{font:500 20px/1 -apple-system,sans-serif;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8)}' +
      '#ud-url{position:fixed;left:50%;top:90px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;font:500 23px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e6eaf3;background:rgba(18,20,26,.94);border:1.5px solid #3c4353;border-radius:999px;padding:15px 30px;max-width:94vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:none;box-shadow:0 10px 30px rgba(0,0,0,.4)}' +
      '#ud-note{position:fixed;left:50%;top:170px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;font:600 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#15181e;background:rgba(255,208,84,.97);border-radius:999px;padding:16px 32px;display:none;box-shadow:0 10px 30px rgba(0,0,0,.4)}';
    document.documentElement.appendChild(S);
    const keys = document.createElement('div'); keys.id = 'ud-keys';
    const url = document.createElement('div'); url.id = 'ud-url';
    const note = document.createElement('div'); note.id = 'ud-note';
    document.documentElement.append(keys, url, note);

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

    let last = '';
    const urlText = () => location.host + location.pathname + location.search + location.hash;
    setInterval(() => {
      if (url.style.display === 'none') return;
      const now = urlText();
      if (now !== last) {
        url.textContent = now;
        if (last) url.animate(
          [{borderColor:'#ffb224', boxShadow:'0 0 0 6px rgba(255,178,36,.35)'}, {borderColor:'#3c4353', boxShadow:'0 10px 30px rgba(0,0,0,.4)'}],
          {duration: 1100});
        last = now;
      }
    }, 140);

    window.__ud = {
      key: (k, hold) => showKeys([k], hold),
      chord: (a, b, hold) => showKeys([a, b], hold),
      url: (on) => { url.style.display = on ? 'block' : 'none'; if (on) { last = ''; } try { sessionStorage.udUrl = on ? '1' : '0'; } catch (e) {} },
      note: (text) => { note.textContent = text; note.style.display = text ? 'block' : 'none'; },
    };
    try { if (sessionStorage.udUrl === '1') window.__ud.url(true); } catch (e) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();`;

const REPO = 'https://github.com/react/react';
const ud = (page, call) => page.evaluate(call).catch(() => {});
const gap = 260; // human-paced chord gap

export default {
  title: '7 GitHub shortcuts you should be using',
  template: 'walkthrough',
  colorScheme: 'light',
  inject: HUD,

  setup: async (page) => {
    await page.goto(REPO, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForLoadState('networkidle').catch(() => {});
  },

  scenes: [
    {
      id: 's1-hook',
      script: 'GitHub has a whole keyboard layer most people never find. Seven shortcuts that make you faster today.',
      durationHint: 6,
    },

    {
      id: 's2-help',
      media: 'clip',
      script: "Press question mark on any page and GitHub shows you every shortcut it has. That's the map. Here's what's worth memorizing.",
      record: async (page, rec) => {
        await ud(page, "__ud.key('?', 1800)");
        await rec.pause(500);
        await page.keyboard.press('Shift+?');
        await rec.skipWhile(() => page.waitForSelector('dialog:visible, [role="dialog"]:visible', {timeout: 10000}));
        await rec.pause(2600); // let the overlay read
        await page.keyboard.press('Escape');
        await rec.pause(500);
      },
      durationHint: 8,
    },

    {
      id: 's3-finder',
      media: 'clip',
      script: "Press T in any repo and just start typing. It's a fuzzy file finder. No clicking through folders, ever.",
      record: async (page, rec) => {
        await ud(page, "__ud.key('T', 1600)");
        await rec.pause(400);
        await page.keyboard.press('t');
        await rec.skipWhile(() => page.waitForTimeout(1200));
        await page.keyboard.type('reacthooks', {delay: 110});
        await rec.pause(1300); // results settle on camera
        await page.keyboard.press('Enter');
        await rec.skipWhile(() => page.waitForURL(/\/blob\//, {timeout: 60000, waitUntil: 'domcontentloaded'}).then(() => page.waitForTimeout(750)));
        await rec.pause(900);
      },
      durationHint: 9,
    },

    {
      id: 's4-line',
      media: 'clip',
      script: "Inside a file, press L, type a line number, and you're there.",
      prepare: async (page) => { await ud(page, '__ud.url(true)'); },
      record: async (page, rec) => {
        await ud(page, "__ud.key('L', 1500)");
        await rec.pause(400);
        await page.keyboard.press('l');
        await rec.pause(900);
        await page.keyboard.type('128', {delay: 160});
        await rec.pause(400);
        await page.keyboard.press('Enter');
        await rec.pause(700);
        // Headless quirk: GitHub sets #L128 + highlight but defers the anchor
        // scroll (real browsers scroll - line permalinks depend on it).
        // Reproduce the app's own behavior so the payoff is on camera.
        await page.evaluate(() => {
          const el = document.querySelector('#LC128') || document.querySelector('[data-line-number="128"]');
          el?.scrollIntoView({block: 'center', behavior: 'smooth'});
        });
        await rec.pause(1600);
      },
      durationHint: 7,
    },

    {
      id: 's5-permalink',
      media: 'clip',
      script: "This one's the keeper. Press Y and the URL pins itself to the exact commit. Share that link and it never breaks, no matter how the file changes later.",
      record: async (page, rec) => {
        await rec.pause(700);
        await ud(page, "__ud.key('Y', 1600)");
        await rec.pause(400);
        await page.keyboard.press('y');
        await rec.pause(2600); // URL chip flashes and re-reads
      },
      durationHint: 11,
    },

    {
      id: 's6-blame',
      media: 'clip',
      script: 'Press B for blame: who touched each line, and when.',
      record: async (page, rec) => {
        await ud(page, "__ud.key('B', 1500)");
        await rec.pause(400);
        await page.keyboard.press('b');
        await rec.skipWhile(() => page.waitForURL(/\/blame\//, {timeout: 60000, waitUntil: 'domcontentloaded'}).then(() => page.waitForTimeout(750)));
        await rec.pause(1400);
      },
      durationHint: 6,
    },

    {
      id: 's7-chords',
      media: 'clip',
      script: 'G then I for issues. G then P for pull requests. G then C brings you home to the code.',
      record: async (page, rec) => {
        await ud(page, "__ud.chord('G', 'I', 1500)");
        await rec.pause(400);
        await page.keyboard.press('g');
        await rec.pause(gap);
        await page.keyboard.press('i');
        await rec.skipWhile(() => page.waitForURL(/\/issues/, {timeout: 60000, waitUntil: 'domcontentloaded'}).then(() => page.waitForTimeout(750)));
        await rec.pause(1300);
        // the issues/pulls pages focus their own search input on load - blur it
        // or the next chord types into the box instead of navigating
        await page.keyboard.press('Escape');
        await rec.pause(300);
        await ud(page, "__ud.chord('G', 'P', 1500)");
        await rec.pause(400);
        await page.keyboard.press('g');
        await rec.pause(gap);
        await page.keyboard.press('p');
        await rec.skipWhile(() => page.waitForURL(/\/pulls/, {timeout: 60000, waitUntil: 'domcontentloaded'}).then(() => page.waitForTimeout(750)));
        await rec.pause(1300);
        await page.keyboard.press('Escape');
        await rec.pause(300);
        await ud(page, "__ud.chord('G', 'C', 1500)");
        await rec.pause(400);
        await page.keyboard.press('g');
        await rec.pause(gap);
        await page.keyboard.press('c');
        await rec.skipWhile(() => page.waitForURL(/react\/?$/, {timeout: 60000, waitUntil: 'domcontentloaded'}).then(() => page.waitForTimeout(750)));
        await rec.pause(1200);
      },
      durationHint: 9,
    },

    {
      id: 's8-search',
      media: 'clip',
      script: 'Slash drops you into search from anywhere.',
      record: async (page, rec) => {
        await ud(page, "__ud.key('/', 1400)");
        await rec.pause(400);
        await page.keyboard.press('/');
        await rec.pause(800);
        await page.keyboard.type('server components', {delay: 90});
        await rec.pause(1100);
        await page.keyboard.press('Escape');
        await rec.pause(400);
      },
      durationHint: 5,
    },

    // DISABLED 2026-07-09: logged out, github.dev blocks on a "GitHub
    // Repositories wants to sign in" dialog and never loads the repo tree -
    // honest capture needs a signed-in profile. Re-enable (set skip: false)
    // once a demo GitHub account exists; see review-gate notes.
    {
      skip: true,
      id: 's9-dev',
      media: 'clip',
      script: 'And the big one. Swap dot com for dot dev, or press period when you are signed in, and the whole repo opens in VS Code, in your browser. Full editor, zero setup.',
      record: async (page, rec) => {
        await ud(page, "__ud.note('github.com \\u2192 github.dev')");
        await rec.pause(1600);
        await rec.skipWhile(async () => {
          await page.goto('https://github.dev/react/react', {waitUntil: 'domcontentloaded', timeout: 90000});
          // wait until the workbench has actually loaded the repo tree, not just booted
          await page.waitForSelector('.explorer-folders-view .monaco-list-row', {timeout: 60000});
          await page.waitForTimeout(1200);
        });
        await ud(page, '__ud.url(true)');
        await rec.pause(2800);
      },
      tailMs: 900,
      durationHint: 11,
    },

    {
      id: 's10-outro',
      script: 'Seven shortcuts, zero mouse. This video was made with Ultrademo: simply point your AI at any app and get a narrated walkthrough like this one.',
      prepare: async (page) => {
        // s8 ends on the repo home already; only navigate if somewhere else
        if (!/github\.com\/react\/react\/?$/.test(page.url())) {
          await page.goto(REPO, {waitUntil: 'domcontentloaded', timeout: 90000});
        }
        await page.waitForLoadState('networkidle').catch(() => {});
        await ud(page, '__ud.url(false)');
      },
      durationHint: 8,
    },
  ],
};
