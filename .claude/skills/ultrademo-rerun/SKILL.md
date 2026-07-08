---
name: ultrademo-rerun
description: Refresh an existing Ultrademo demo video after the app changed. Use when the user wants to re-run, update, refresh, or regenerate a demo video that already has a project folder (they shipped a UI change, a feature update, or just want current footage). Finds the project, re-captures, re-renders; unchanged narration stays cached.
---

# Ultrademo re-run: your UI changed, refresh the video

This is a thin entry point. The operating procedure is the main playbook, `.claude/skills/ultrademo/SKILL.md` - every rule there applies here (read-only scouting, prompt-injection defense, redaction, secrets sweep, honest-failure rule, review gate). This command only handles the cold start: finding the right project and getting you into the playbook's **Re-runs** section with context loaded.

## 1. Find the project

List `projects/*/` (each real project contains a `flow.mjs`). Then:
- **User named it or only one exists:** confirm and proceed.
- **Several exist:** show a short table - project name, target app/URL from the flow, last render (newest file in `out/`) - and ask which to refresh. Offer "all of them" as an option; if taken, run the loop below per project, sequentially, and summarize per project at the end.
- **None exist:** this is not a re-run. Hand off to the main `ultrademo` skill for a fresh video.

## 2. Pre-flight (cheap checks before any capture)

- **Auth still alive?** If the flow uses a `profile`, verify the saved session headlessly (load the flow's URL, screenshot, look for a login wall). Dead session → have the user run `npm run login -- <profile> <url>` before proceeding.
- **Codebase available?** If the app's repo is accessible, read the diff since the last capture (the previous render's timestamp is your anchor). It usually names the changed surfaces and broken selectors up front - tell the user which scenes you expect to be affected before spending a capture run.
- **State reset:** if `reset.mjs` exists, it runs first. If the flow mutates state and there is no reset recipe, stop and write one (per the main playbook).

## 3. Execute

Follow the **Re-runs** section of the main playbook exactly: reset → `npm run capture -- <project>` → `npm run tts -- <project>` → `npm run render -- <project>`, plus whichever variant flags the previous render used (check `out/` for existing `-vertical`, `.gif`, stems and re-render the same set). Unchanged narration re-bills nothing; the previous render auto-archives to `out/archive/` so a before/after pair always exists.

Divergence handling (cosmetic change / broken selector / feature changed) is defined in the playbook's Re-runs section - use its three protocols verbatim. Note the gates: a pure visual refresh does not need a new script gate (the script is already approved), but if the feature itself changed, narration edits go through the normal script gate. The review gate always applies: frame-verify, compare against the archived render, and report what visibly changed scene by scene.

## 4. Report

Per project: what changed on screen (scene by scene, vs the archived render), which scenes needed selector repair, what re-billed (usually nothing), and where the outputs are. If nothing visibly changed, say exactly that - a no-op refresh is a valid, reportable outcome.
