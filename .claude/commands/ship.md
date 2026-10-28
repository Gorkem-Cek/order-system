---
description: Lint, typecheck, test, commit, and open a PR for the current work
---
Ship the current work:

1. If on `main`, create a feature branch named after the change (e.g. `feat/order-cancel`).
2. Run `npm run lint`, `npm run typecheck`, and `npm test`. Fix any failures.
3. Use the code-reviewer subagent on the diff and fix every "Must fix" item.
4. Commit with a conventional commit message.
5. Push the branch and open a PR with `gh pr create`, with a summary, testing notes, and screenshots for UI changes.
$ARGUMENTS
