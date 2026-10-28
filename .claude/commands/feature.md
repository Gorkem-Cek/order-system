---
description: Plan and implement a feature end to end (shared types → API → web → tests)
argument-hint: <feature description or GitHub issue number>
---
Implement this feature: $ARGUMENTS

If it is an issue number, read it with `gh issue view`.

1. Explore the relevant code and write a short plan; ask me if anything is ambiguous.
2. Add/update zod schemas and types in `packages/shared`.
3. Implement the API (route → service → repository) with tests.
4. Implement the web UI and check it visually with the playwright MCP server.
5. Run lint, typecheck, and tests; then summarize what changed.
