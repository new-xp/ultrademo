# Your videos live here

Each demo you make gets its own folder in here, named `<app>-<topic>-<YYYY-MM-DD-HHMM>/`:

```
projects/<name>/
  flow.mjs      # the shot list (source - keep in git)
  reset.mjs     # optional state-reset recipe for retakes
  assets/       # storyboard.json + captures + audio   (gitignored)
  out/          # the finalized MP4 and variants        (gitignored)
```

Start one by copying `capture/flow-template.mjs` to `projects/<name>/flow.mjs`, or just open this
workspace in Claude Code and ask for a demo video - the skill authors the flow for you.

For a complete worked example, see [`examples/notion-tracker/`](../examples/notion-tracker/).
