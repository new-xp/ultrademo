# Ultrademo

Point your AI Agent at your web app and get a narrated demo video. Everything runs on **your** machine: your credentials, your data, and your renders never leave it.

## See it work

![Ultrademo output: building a project tracker in Notion, captured and narrated automatically](docs/notion-tracker.gif)

This 90-second Notion tutorial was produced end to end by the pipeline: scouted, scripted (with a human sign-off), captured through a signed-in browser session, narrated with ElevenLabs, and rendered - all from [one flow file](examples/notion-tracker/flow.mjs). The full MP4 with narration is on [ultrademo.net](https://ultrademo.net).

Ultrademo is a capture-and-render pipeline plus a Claude Code skill that drives it. Tell Claude "make a 2-minute walkthrough of my app", review the script it drafts, and get a finished, narrated MP4. The same capture can also produce opt-in extras when they fit: a GIF (downscaled, for READMEs and embeds), a 9:16 vertical cut (best when your app has a mobile view - cropping a dense desktop UI rarely earns it), or editor-ready stems (clean video + narration track + SRT) if you finish in your own editor.

**How it works:** a flow file (the shot list) drives Playwright through your app, producing a `storyboard.json` - ordered scenes with screenshots, real screen-recording clips, cursor tracks, and narration lines. TTS voices each line; Remotion renders the result with zooms, a synthetic cursor, and captions. The storyboard is the single source of truth: edit a narration line and re-render in minutes, re-capture one scene when your UI changes.

## Requirements

- Node 20+ (22 recommended), macOS / Linux / Windows
- ffmpeg + ffprobe (`brew install ffmpeg` / `apt install ffmpeg` / `winget install ffmpeg`)
- Chromium for Playwright (`npx playwright install chromium`)
- A voice, best-first: an [ElevenLabs](https://elevenlabs.io) API key in `.env` (premium) → [Piper](https://github.com/rhasspy/piper) (`pip install piper-tts` - free, offline, all platforms) → macOS `say` (zero-install placeholder). Unchanged narration lines are cached, so re-renders never re-bill your ElevenLabs quota.

## Install

**Recommended - install the skill:**

```bash
npx skills add new-xp/ultrademo
```

This adds the `ultrademo` skill to your coding agent (Claude Code, Codex, Cursor, OpenCode, Windsurf, ...). Then open your project and ask for a demo video: on first run the skill provisions the pipeline for you - clones this repo into `ultrademo-workspace/`, runs `npm install` and `playwright install`, creates `.env`, and verifies your environment - then scouts your app, drafts a scene-by-scene script for your sign-off, captures, and renders.

Built and tested with Claude Code; any agent that reads `AGENTS.md` can follow the same playbook. Gemini CLI looks for `GEMINI.md` by default, so set its `contextFileName` to `AGENTS.md` (or copy the file).

**Or set up the workspace yourself** (no skill CLI, or you just want the pipeline):

```bash
git clone https://github.com/new-xp/ultrademo ultrademo-workspace && cd ultrademo-workspace
npm install
npx playwright install chromium
npm run doctor                 # verifies your environment
cp .env.example .env           # optional: add ELEVENLABS_API_KEY for premium narration
```

With the folder open in Claude Code (or another AGENTS.md-aware agent), just ask for a demo video. Prefer to drive it by hand? See **Manually** below.

**Manually:** copy `capture/flow-template.mjs` to `projects/<app>-<topic>-<date-time>/flow.mjs`, edit the scenes, then:

```bash
npm run capture -- <project>         # loads projects/<project>/flow.mjs
npm run tts -- <project>
npm run render -- <project>          # projects/<project>/out/<project>.mp4 (finalized)
npm run render -- <project> --vertical   # 9:16 cut (best for mobile-responsive apps; crops desktop UIs)
npm run render -- <project> --gif        # animated GIF (960x540, 15fps - keep videos short for this)
npm run render -- <project> --no-captions  # finalized video without burned-in captions
npm run render -- <project> --stems      # editor-ready stems (clean video, narration.mp3, captions.srt) + the finalized video
npm run studio                       # scrubbable preview
```

## What a flow can do

Still scenes (screenshot + Ken Burns zoom), clip scenes (real recordings of typing, dialogs, transitions - with demo-paced actions, a synthetic cursor overlay, and `skipWhile()` jump-cuts over spinners), and phone-framed mobile scenes.

Each video is a self-contained project folder - assets and outputs together, nothing scattered:

```
ultrademo-workspace/
├── .env                          # ELEVENLABS_API_KEY=... (optional, gitignored)
├── .claude/skills/ultrademo/     # the skill (active when this folder is open in Claude Code)
├── .profiles/                    # signed-in browser sessions from `npm run login` (gitignored)
├── capture/  tts/  render/  scripts/   # pipeline code (+ capture/flow-template.mjs)
└── projects/<app>-<topic>-<YYYY-MM-DD-HHMM>/     # ONE folder per video
    ├── flow.mjs                  # the shot list (source - keep in git)
    ├── reset.mjs                 # optional state-reset recipe for retakes
    ├── assets/                   # storyboard.json + captures/ + audio/ (gitignored)
    └── out/                      # finalized MP4, variants, stems/ (gitignored)
```

Project names follow `<app>-<feature-or-topic>-<date-time>`; retakes reuse the same project folder (that's what keeps the TTS cache warm). Preview any project with `npm run studio -- --public-dir projects/<name>/assets`.

## Formats: one capture, the outputs that earn it

The default deliverable is always the **finalized 16:9 MP4** - captions burned in, narration mixed, ready to publish. Everything else is an opt-in re-render of the same storyboard, so none of it costs a re-capture or re-bills narration:

| Output | Command | When it earns its place |
|---|---|---|
| Finalized MP4 (16:9) | `npm run render -- <project>` | always - the default, and still produced even when you ask for extras |
| Vertical 9:16 | `--vertical` | your app has a mobile view, or the action is concentrated enough to survive the crop; dense desktop UIs usually aren't worth it |
| GIF | `--gif` | READMEs, PRs, embeds - downscaled to 960x540/15fps; keep the target short (a 90s video ≈ 9 MB). GIFs are silent, so captions stay burned in by default to carry the narration; add `--no-captions` for a clean visual loop |
| No burned-in captions | `--no-captions` | you'll subtitle in your publishing platform instead |
| Editor stems | `--stems` | you finish in Premiere/Resolve/CapCut: clean video track + timeline-aligned `narration.mp3` + `captions.srt`, everything lining up on drop-in |

## Redaction: capture over real data, safely

Demo videos usually get shot against real apps with real data in them. Ultrademo's answer is **in-page redaction**: your flow ships a small script that blurs sensitive content live in the page - so it applies to stills *and* clips, survives scrolling and navigation, and never modifies your app or its data. Blur by pattern (emails, account numbers) or by selector (a customer-name column), and whitelist what should stay visible:

```js
redactScript: `(() => {
  const RE = /@yourcompany\.com|ACC-\d+/;           // patterns to blur
  const sweep = () => {
    for (const el of document.querySelectorAll('span,div,p,a,td')) {
      if (!el.dataset.redacted && el.children.length === 0 && RE.test(el.textContent)) {
        el.style.filter = 'blur(6px)';
        el.dataset.redacted = '1';
      }
    }
  };
  new MutationObserver(sweep).observe(document.body, {childList: true, subtree: true, characterData: true});
  sweep(); setInterval(sweep, 400);
})();`,
```

The skill offers redaction whenever you're capturing real data, and its final frame check also sweeps for visible secrets (URL-bar tokens, keys in forms) before anything is presented. And because everything runs on your machine, unredacted frames never leave it in the first place.

## Re-runs: your UI changed, your video shouldn't go stale

Every video is a stored, re-runnable project - that's the point of the project folder. When your app ships an update days or months later:

```bash
node projects/<project>/reset.mjs        # if the flow mutates app state
npm run capture -- <project>             # same flow, fresh footage
npm run tts -- <project>                 # unchanged lines are cached - a visual refresh re-bills nothing
npm run render -- <project>
```

Previous renders are automatically archived to `projects/<project>/out/archive/`, so every re-run leaves a before/after pair. If the update was cosmetic, that's the whole job. If it broke a selector, the skill re-scouts just the affected surface and patches the flow; if the feature itself changed, you edit the narration and only the edited lines re-synthesize. Reprompt, not reshoot.

In Claude Code, `/ultrademo-rerun` does all of this for you: it lists your projects, checks your saved login still works, reads your repo's diff since the last capture when the code is available, and reports what visibly changed scene by scene.

## Capturing production apps

Rules the skill enforces and manual users should follow: scout read-only; never save settings on camera; know which actions cost money before recording them (retakes multiply the cost); give stateful flows a reset recipe; redact anything you would not show a stranger (see above).

## Security

Scanned with [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) - **0/100, SAFE** with the committed baseline. Every finding was triaged; the false positives (all heuristic matches on legitimate browser-automation and `.env` key-setup code) are documented with justifications in [`.skillspector-baseline.yaml`](.skillspector-baseline.yaml). Full write-up: [`SECURITY-SCAN.md`](SECURITY-SCAN.md). Reproduce with `skillspector scan . --no-llm --baseline .skillspector-baseline.yaml`.

## License

Apache-2.0 (see `LICENSE`). Note: Ultrademo depends on [Remotion](https://remotion.dev), which has its own license - free for individuals and small companies, but larger companies need a Remotion company license. Check your eligibility at remotion.dev/license.

---

Built by [New XP](https://newxp.co) · https://ultrademo.net
