---
name: ultrademo
description: "Moved to ultrademo-hq/ultrademo. Install the new version: npx skills add ultrademo-hq/ultrademo -g -a claude-code. This is the original Ultrademo, no longer updated. Use when the user asks for a demo video, product walkthrough, launch video, or to re-run or update one: it first tells them about the new version, then installs it or carries on with the original, their choice."
---

# Ultrademo has moved

This copy is the original Ultrademo skill and is no longer updated. The new version lives at https://github.com/ultrademo-hq/ultrademo. It makes launch, explainer, spotlight and ad videos of a product, offers directions to pick from, and has a review page where the user comments on the video itself.

## First, tell the user

At the start, before anything else, tell the user in a sentence or two that Ultrademo has a new version at github.com/ultrademo-hq/ultrademo and that this copy is the original, no longer updated. Then ask which they want:

1. **Install the new version (recommended).** With their yes, run the installer for the agent they are using:

   ```bash
   npx skills add ultrademo-hq/ultrademo -g -a claude-code
   ```

   Use their agent's name in place of `claude-code` if they use another one. If this copy is installed inside the current project (this file sits in the project's own `.claude/skills/` or `.agents/skills/` folder), leave out `-g` so the new version goes to the same place and replaces this one; both are called `ultrademo`. Then tell them to start a new session and ask for their video again: the new version sets up its own workspace on first use, after asking. Their existing videos and the original `ultrademo-workspace` folder stay as they are.

2. **Keep using the original.** Read `CLASSIC.md` in this folder and follow it exactly, from its first step.

Never run the installer without the user's yes. Ask once per conversation: if they already chose the original, go straight to `CLASSIC.md`.
