# Order System

Full-stack order management app: customers browse products, place orders, and track order status; admins manage products and move orders through their lifecycle.

## Stack
- **Language:** TypeScript (strict mode) everywhere, Node.js 20+
- **Monorepo:** npm workspaces — `apps/api` (backend), `apps/web` (frontend), `packages/shared` (shared types + zod schemas)
- **API:** Express or Fastify, PostgreSQL via Prisma, zod for request validation
- **Web:** React + Vite
- **Tests:** Vitest (unit/integration), Playwright (end-to-end)
- **Lint/format:** ESLint + Prettier

## Commands (run from repo root)
- `npm install` — install all workspaces
- `npm run dev` — start api + web in dev mode
- `npm run lint` / `npm run typecheck` / `npm test` — must all pass before committing
- `npm run test:e2e` — Playwright end-to-end tests

## Domain rules
- Order status flow: `pending → paid → shipped → delivered`; `cancelled` allowed only from `pending` or `paid`. Enforce in one place (the order service), never in route handlers.
- Money is stored as integer cents, never floats.
- Request/response shapes live in `packages/shared` and are imported by both api and web.

## Conventions
- Small, focused modules; route → service → repository layering in the API.
- Every new endpoint or service function gets tests in the same change.
- Never commit secrets; config comes from `.env` (see `.env.example`).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Work on feature branches and open a PR against `main`; keep PRs small.

## Working notes for Claude
- Plan before large changes; ask if a requirement is ambiguous.
- Use the context7 MCP server to check current library docs before using unfamiliar APIs.
- Use the playwright MCP server to visually check UI changes in the running dev server.
- Update this file when commands or structure change.
