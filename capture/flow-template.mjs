// Ultrademo flow template.
// Copy to projects/<app>-<topic>-<YYYY-MM-DD-HHMM>/flow.mjs and adapt - the
// project folder name is the project name (timestamp = creation; retakes reuse
// the same folder, which preserves the TTS cache).
//
// Run: npm run capture -- <project>
// If the flow mutates app state, add a projects/<project>/reset.mjs recipe and
// run it before each retake.

const BASE = 'http://localhost:3000'; // NOTE: some frameworks (Next.js server
// actions) fail origin checks on 127.0.0.1 - prefer the localhost hostname.
// Credentials come from .env (run: cp .env.example .env), never hardcoded here.
// For SSO / human-check logins, drop `setup` and use `npm run login` instead;
// the capture then reuses that session via `profile: '<name>'` below.
const EMAIL = process.env.APP_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.APP_PASSWORD ?? 'change-me';

// Optional: blur sensitive content in-page (works in stills AND clips, and
// survives navigation/scrolling). Adapt the regex/selectors to your app.
const REDACT = `(() => {
  const RE = /@example\\.com/;
  const sweep = () => {
    for (const el of document.querySelectorAll('span,div,p,a,td,button')) {
      if (el.dataset.redacted) continue;
      if (el.children.length === 0 && RE.test(el.textContent)) {
        el.style.filter = 'blur(6px)';
        el.dataset.redacted = '1';
      }
    }
  };
  const start = () => {
    sweep();
    new MutationObserver(sweep).observe(document.body, {childList: true, subtree: true, characterData: true});
    setInterval(sweep, 400);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export default {
  title: 'My App - walkthrough',
  template: 'walkthrough', // or 'sizzle'
  colorScheme: 'light', // or 'dark' - match your app's theme
  redactScript: REDACT, // omit if nothing needs masking

  // Optional presentation (all omittable; sensible defaults if absent):
  // brand: '#ffb224',                 // accent for slides + branded captions
  // caption: {theme: 'outline', size: 'md', position: 'bottom', highlight: 'dim'},
  //   // theme: 'outline' (default - light text + dark stroke, no box; over
  //   //   busy, text-dense screens prefer a background: 'pill' or 'bar')
  //   //   | 'pill' (dark chip) | 'bar' (full-width lower third)
  //   // size: 'sm' | 'md' | 'lg'; position: 'bottom' | 'top'
  //   // highlight (karaoke, ElevenLabs voice only): 'dim' (active word bright,
  //   //   rest dimmed) | 'pill' (brand chip under active word) | 'wipe' (accent
  //   //   sweeps across each word as spoken - recommended with ElevenLabs).
  //   //   Free voices ignore it and stay static.
  // intro: {title: 'My App - walkthrough', subtitle: 'A quick tour'},
  //   // title card over a framed app screenshot (auto-filled from the first
  //   // captured scene; pass `screenshot: '<file>'` to override)
  // outro: {title: 'Thanks for watching', subtitle: 'Made with Ultrademo', url: 'myapp.com'},

  // Runs once before the scenes (not part of any clip window).
  setup: async (page) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', {timeout: 20_000});
  },

  scenes: [
    // STILL scene: screenshot + Ken Burns zoom toward `target`.
    {
      id: 's1-intro',
      settleMs: 1500, // let the page settle before the screenshot
      target: 'h1', // zoom/cursor anchor; also clicked to advance unless action:'none'
      action: 'none', // 'none' = observe only; omit = click target to advance state
      zoom: 1.2,
      // Wrap exact on-screen strings (button labels, statuses, typed values) in
      // double quotes: captions tint them the literal color (default sky blue,
      // quote marks stripped) and the voice lifts them slightly. Quotes are for
      // UI literals only.
      script: 'This is the narration line - click "New thing" to start.',
    },

    // CLIP scene: real screen recording of the actions in `record`.
    {
      id: 's2-create-thing',
      media: 'clip',
      prepare: async (page) => {
        await page.goto(`${BASE}/things`); // unrecorded setup for the scene
      },
      settleMs: 1000,
      record: async (page, rec, ctx) => {
        await rec.click('a:has-text("New thing")'); // demo-paced, cursor logged
        await rec.type('input[name=name]', 'My first thing');
        await rec.pause(400);
        await rec.click('button:has-text("Create")');
        // Long waits (spinners, network) get jump-cut out of the clip:
        await rec.skipWhile(async () => {
          await page.waitForURL('**/things/**', {timeout: 30_000});
        });
        await rec.pause(1200); // let the payoff land on screen
        // Other helpers: rec.select, rec.moveTo (hover), rec.drag (sliders),
        // rec.clickPoint({x,y}) for iframe content.
      },
      after: async (page, ctx) => {
        ctx.thingUrl = page.url(); // stash values for later scenes
      },
      script: 'Creating something on camera - typing, clicks, and transitions are all real.',
    },

    // PHONE scene: renders a URL in a mobile viewport inside a phone bezel.
    {
      id: 's3-mobile',
      phone: true,
      url: (ctx) => ctx.thingUrl, // or a fixed string
      settleMs: 1000,
      durationHint: 3.5,
      script: 'And it works on a phone.',
    },
  ],
};

// PRODUCTION SAFETY, if you capture a live app:
// - never save settings/rules pages on camera; preview-only interactions
// - know which actions cost money/credits before recording them
// - stateful apps need a reset recipe so the flow is re-runnable
// - use redactScript for anything you would not show a stranger
