// Ultrademo capture harness.
// Runs a flow definition through Playwright and emits a per-project storyboard
// (public/projects/<project>/storyboard.json), one screenshot per scene, and
// (for media:'clip' scenes) a per-scene screen recording sliced out of the
// session video, plus a cursor-event track the renderer uses to overlay a
// synthetic cursor in sync with the real actions.
//
// Usage: npm run capture -- <project>
// Loads projects/<project>/flow.mjs; the folder name IS the project name.

import {chromium} from 'playwright';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const execFileP = promisify(execFile);

const VIEWPORT = {width: 1920, height: 1080};
const PHONE_VIEWPORT = {width: 390, height: 844};

const project = process.argv[2];
if (!project) {
  console.error('Usage: npm run capture -- <project>   (expects projects/<project>/flow.mjs)');
  process.exit(1);
}

const flowPath = path.resolve('projects', project, 'flow.mjs');
const {default: flow} = await import(pathToFileURL(flowPath).href);

// Everything for a video lives in one self-contained folder:
// projects/<project>/{assets/{storyboard.json,captures,audio,recording}, out/}
const projectDir = path.resolve('projects', project);
const assetsDir = path.join(projectDir, 'assets');
const recDir = path.join(assetsDir, 'recording');
await mkdir(path.join(assetsDir, 'captures'), {recursive: true});
await rm(recDir, {recursive: true, force: true});
await mkdir(recDir, {recursive: true});

// With `profile: '<name>'` in the flow, capture reuses a persistent browser
// profile created by `npm run login -- <name> <url>` (auth handoff for apps
// with SSO or sessions you can't script). Otherwise a clean browser launches.
const contextOptions = {
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: flow.colorScheme ?? 'light',
  recordVideo: {dir: recDir, size: VIEWPORT},
};
let browser = null;
let context;
if (flow.profile) {
  // `channel: 'chrome'` in the flow runs the capture on the installed Google
  // Chrome build - use it when the profile was created against a site whose
  // sign-in rejects bundled Chromium (login.mjs prefers real Chrome too).
  // `realKeychain: true` disables Playwright's mock keychain so the capture
  // can decrypt cookies written by a MANUAL (non-automated) Chrome session on
  // this profile - the escape hatch for sign-ins whose bot checks reject any
  // automated browser: `open -na "Google Chrome" --args --user-data-dir=<
  // .profiles/name>` , sign in by hand, quit Chrome CLEANLY (Cmd+Q - a kill
  // loses the cookies), then capture with channel+realKeychain.
  context = await chromium.launchPersistentContext(
    path.resolve('.profiles', flow.profile),
    {
      headless: true,
      channel: flow.channel,
      ...(flow.realKeychain ? {ignoreDefaultArgs: ['--use-mock-keychain']} : {}),
      ...contextOptions,
    },
  );
} else {
  browser = await chromium.launch();
  context = await browser.newContext(contextOptions);
}

// Hide framework dev-mode chrome (e.g. the Next.js badge and dev-tools button
// render inside <nextjs-portal>) so captures look like production.
await context.addInitScript(() => {
  const hide = () => {
    const style = document.createElement('style');
    style.textContent =
      'nextjs-portal{display:none!important}' +
      'div[class*="styles-module__toolbar"]{display:none!important}';
    (document.head ?? document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hide);
  } else {
    hide();
  }
});

// Flow-provided redaction/masking: a script injected into every page (runs on
// live DOM, so it covers stills AND clips, and survives navigation/scrolling).
if (flow.redactScript) {
  await context.addInitScript({content: flow.redactScript});
}

// General-purpose page injection (same mechanism, different intent): overlays
// the flow wants on camera - keystroke callouts, a live URL chip, annotations.
// Must only VISUALIZE real page state/events, never fabricate app UI.
if (flow.inject) {
  await context.addInitScript({content: flow.inject});
}

const page = context.pages()[0] ?? (await context.newPage());
const video = page.video();
const videoStart = Date.now();

// Shared scratch space flow hooks can use to pass values between scenes
// (e.g. a generated link consumed by a later phone-frame scene).
const ctx = {};

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

// Recorder: performs actions with demo pacing (eased mouse travel, typing
// delay) and logs a timestamped cursor-event track relative to clip start.
const makeRecorder = (clipStart, seedPos) => {
  const events = [];
  const skips = [];
  let cur = {...seedPos};
  const now = () => (Date.now() - clipStart) / 1000;
  events.push({t: 0, type: 'move', x: cur.x, y: cur.y});

  const centerOf = async (selector) => {
    const loc = page.locator(selector).first();
    await loc.waitFor({state: 'visible', timeout: 15_000});
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(120);
    const box = await loc.boundingBox();
    if (!box) throw new Error(`no bounding box for ${selector}`);
    return {x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2)};
  };

  const moveTo = async (to) => {
    const dist = Math.hypot(to.x - cur.x, to.y - cur.y);
    if (dist < 2) return;
    const durMs = Math.min(900, Math.max(350, dist * 0.8));
    events.push({t: now(), type: 'move', x: cur.x, y: cur.y});
    const steps = Math.max(8, Math.round(durMs / 25));
    for (let i = 1; i <= steps; i++) {
      const e = easeInOut(i / steps);
      await page.mouse.move(cur.x + (to.x - cur.x) * e, cur.y + (to.y - cur.y) * e);
      await page.waitForTimeout(durMs / steps);
    }
    cur = {...to};
    events.push({t: now(), type: 'move', x: cur.x, y: cur.y});
  };

  return {
    events,
    skips,
    position: () => ({...cur}),
    pause: (ms) => page.waitForTimeout(ms),
    moveTo: async (selector) => moveTo(await centerOf(selector)),
    click: async (selector) => {
      await moveTo(await centerOf(selector));
      await page.waitForTimeout(180);
      events.push({t: now(), type: 'click', x: cur.x, y: cur.y});
      await page.mouse.down();
      await page.mouse.up();
    },
    type: async (selector, text, {delay = 60} = {}) => {
      await moveTo(await centerOf(selector));
      events.push({t: now(), type: 'click', x: cur.x, y: cur.y});
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(220);
      await page.keyboard.type(text, {delay});
    },
    select: async (selector, value) => {
      await moveTo(await centerOf(selector));
      events.push({t: now(), type: 'click', x: cur.x, y: cur.y});
      await page.locator(selector).first().selectOption(value);
    },
    // Click at explicit viewport coordinates (for iframe content and other
    // targets a page-level selector can't reach), with the cursor track logged.
    clickPoint: async (pt) => {
      await moveTo({x: Math.round(pt.x), y: Math.round(pt.y)});
      await page.waitForTimeout(180);
      events.push({t: now(), type: 'click', x: Math.round(pt.x), y: Math.round(pt.y)});
      await page.mouse.down();
      await page.mouse.up();
    },
    // Press-and-drag on an element (e.g. a range slider): mousedown at its
    // center, eased horizontal drag to `fraction` of its width, release.
    drag: async (selector, fraction = 0.35) => {
      const loc = page.locator(selector).first();
      await loc.waitFor({state: 'visible', timeout: 15_000});
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const box = await loc.boundingBox();
      if (!box) throw new Error(`no bounding box for drag ${selector}`);
      const start = {x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2)};
      const end = {x: Math.round(box.x + box.width * fraction), y: start.y};
      await moveTo(start);
      events.push({t: now(), type: 'click', x: start.x, y: start.y});
      await page.mouse.down();
      await page.waitForTimeout(150);
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const e = easeInOut(i / steps);
        await page.mouse.move(start.x + (end.x - start.x) * e, start.y);
        await page.waitForTimeout(30);
      }
      cur = {...end};
      events.push({t: now(), type: 'move', x: end.x, y: end.y});
      await page.mouse.up();
    },
    // Wrap a long wait (spinner, network round-trip) so the slicer removes it
    // from the clip - the final video jump-cuts over dead time.
    skipWhile: async (fn) => {
      const from = now();
      await fn();
      skips.push([from, now()]);
    },
  };
};

// Drop events inside skip windows and shift later events left.
const applySkips = (events, skips) =>
  events
    .filter((ev) => !skips.some(([a, b]) => ev.t > a && ev.t < b))
    .map((ev) => ({
      ...ev,
      t: Number(
        (ev.t - skips.reduce((acc, [a, b]) => acc + (b <= ev.t ? b - a : 0), 0)).toFixed(3),
      ),
    }));

const scenes = [];
const clipJobs = [];
let lastCursor = {x: 960, y: 620};

if (flow.setup) {
  await flow.setup(page, ctx);
}

for (const scene of flow.scenes) {
  // `skip: true` drops a scene from this capture without deleting its
  // definition - for beats pending renegotiation or temporarily broken.
  if (scene.skip) {
    console.log(`skipped ${scene.id} (skip: true)`);
    continue;
  }

  // Phone-framed still: renders a URL (usually from ctx) in a mobile viewport.
  if (scene.phone) {
    const url = typeof scene.url === 'function' ? scene.url(ctx) : scene.url;
    const phonePage = await context.newPage();
    await phonePage.setViewportSize(PHONE_VIEWPORT);
    await phonePage.goto(url);
    await phonePage.waitForLoadState('networkidle').catch(() => {});
    if (scene.preparePhone) await scene.preparePhone(phonePage, ctx);
    await phonePage.waitForTimeout(scene.settleMs ?? 800);
    const file = `captures/${scene.id}.png`;
    await phonePage.screenshot({path: path.join(assetsDir, file)});
    await phonePage.close();
    scenes.push({
      id: scene.id,
      media: 'still',
      frame: 'phone',
      screenshot: file,
      script: scene.script,
      durationHint: scene.durationHint ?? 4,
    });
    console.log(`captured ${scene.id} (phone still)`);
    continue;
  }

  if (scene.prepare) await scene.prepare(page, ctx);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(scene.settleMs ?? 400);

  if (scene.media === 'clip') {
    const clipStart = Date.now();
    const rec = makeRecorder(clipStart, lastCursor);
    await rec.pause(scene.leadInMs ?? 700); // settled frame before anything moves
    await scene.record(page, rec, ctx);
    await page.waitForTimeout(scene.tailMs ?? 600);
    const clipEnd = Date.now();

    const file = `captures/${scene.id}.png`;
    await page.screenshot({path: path.join(assetsDir, file)});

    const skipTotal = rec.skips.reduce((a, [s, e]) => a + (e - s), 0);
    const clipDuration = Number(((clipEnd - clipStart) / 1000 - skipTotal).toFixed(3));
    clipJobs.push({
      id: scene.id,
      start: (clipStart - videoStart) / 1000,
      end: (clipEnd - videoStart) / 1000,
      skips: rec.skips,
    });
    scenes.push({
      id: scene.id,
      media: 'clip',
      clip: `captures/${scene.id}.mp4`,
      clipDuration,
      screenshot: file, // end state, used as the freeze frame after the clip
      script: scene.script,
      events: applySkips(rec.events, rec.skips),
      durationHint: scene.durationHint ?? 4,
    });
    lastCursor = rec.position();
    console.log(
      `captured ${scene.id} (clip ${clipDuration}s${rec.skips.length ? `, ${rec.skips.length} skip(s)` : ''})`,
    );
  } else {
    // Still scene
    let action;
    let focus;
    if (scene.target) {
      const locator = page.locator(scene.target).first();
      await locator.waitFor({state: 'visible', timeout: 10_000});
      const box = await locator.boundingBox();
      if (box) {
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        action = {type: scene.action ?? 'click', x, y};
        focus = {x, y, zoom: scene.zoom ?? 1.35};
      }
    }

    const file = `captures/${scene.id}.png`;
    await page.screenshot({path: path.join(assetsDir, file)});
    scenes.push({
      id: scene.id,
      media: 'still',
      screenshot: file,
      script: scene.script,
      focus,
      action,
      durationHint: scene.durationHint ?? 4,
    });
    if (action) lastCursor = {x: action.x, y: action.y};
    console.log(`captured ${scene.id}${action ? ` (target @ ${action.x},${action.y})` : ''}`);

    // Advance state for the next scene
    if (scene.target && (scene.action ?? 'click') === 'click' && !scene.noAdvance) {
      await page.locator(scene.target).first().click();
    }
  }

  if (scene.after) await scene.after(page, ctx);
}

await context.close(); // flushes the session recording to disk
if (browser) await browser.close();

// Slice per-scene clips out of the session recording (skip windows removed).
if (clipJobs.length) {
  const videoPath = await video.path();
  for (const job of clipJobs) {
    const total = job.end - job.start;
    const segs = [];
    let t = 0;
    for (const [a, b] of job.skips) {
      if (a > t) segs.push([t, a]);
      t = b;
    }
    if (total > t) segs.push([t, total]);

    const filters = segs.map(
      ([a, b], i) =>
        `[0:v]trim=start=${(job.start + a).toFixed(3)}:end=${(job.start + b).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    );
    const concat = `${segs.map((_, i) => `[v${i}]`).join('')}concat=n=${segs.length}:v=1[out]`;
    const outFile = path.join(assetsDir, 'captures', `${job.id}.mp4`);
    await execFileP('ffmpeg', [
      '-y',
      '-i',
      videoPath,
      '-filter_complex',
      `${filters.join(';')};${concat}`,
      '-map',
      '[out]',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      outFile,
    ]);
    console.log(`sliced ${job.id}.mp4`);
  }
}

const sbOut = path.join(assetsDir, 'storyboard.json');
await writeFile(
  `${sbOut}.tmp`,
  JSON.stringify(
    {title: flow.title, template: flow.template ?? 'walkthrough', project, scenes},
    null,
    2,
  ),
);
await (await import('node:fs/promises')).rename(`${sbOut}.tmp`, sbOut);
console.log(`projects/${project}/assets/storyboard.json written with ${scenes.length} scenes`);
