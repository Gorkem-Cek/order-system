# Siparİş

QR table-ordering for cafés (multi-tenant). Guests scan a table QR, browse the café's menu, pay (mocked for now) and the order appears live on the staff board; café staff manage orders, menu and tables; a super-admin manages all cafés. Full product spec: `docs/SPEC.md` — read it before feature work.

## Stack

- **Language:** TypeScript (strict mode) everywhere, Node.js 22.12+ (24 LTS recommended)
- **Monorepo:** npm workspaces — `apps/api` (backend), `apps/web` (frontend), `packages/shared` (shared types + zod schemas)
- **API:** Fastify, PostgreSQL via Prisma, zod for request validation, SSE for real-time staff updates
- **Web:** React + Vite, react-i18next (Turkish default, English toggle)
- **Deploy:** Railway (API serves built web app) + managed Postgres + Cloudflare R2 for images
- **Tests:** Vitest (unit/integration), Playwright (end-to-end)
- **Lint/format:** ESLint + Prettier

## Commands (run from repo root)

- `npm install` — install all workspaces
- `npm run dev` — start api + web in dev mode
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run format:check` — must all pass before committing
- `npm run format` — format everything with Prettier
- `npm run build` — build web (`apps/web/dist`) and api (`apps/api/dist`)
- `npm run test:e2e` — Playwright end-to-end tests (added in a later step)
- Local DB: PostgreSQL 17 on `localhost:5432`, database `siparis`; set `DATABASE_URL` in `.env`
- `npm run db:migrate -- --name <change>` — create + apply a migration after editing `apps/api/prisma/schema.prisma`
- `npm run db:seed` — (re)create the demo café "Demo Kafe" with dev logins (printed by the seed)
- `npm run db:reset` / `npm run db:deploy` / `npm run db:studio` — reset dev DB / apply migrations / browse data
- The Prisma client is generated into `apps/api/src/generated` on `npm install` (not committed)

## Domain rules

- Order status flow: `new → preparing → served`; `cancelled` allowed only from `new` or `preparing`. Enforce in one place (the order service), never in route handlers.
- Orders are created only after payment succeeds (pay-before-send).
- Money is stored as integer kuruş (TRY), never floats. The server recalculates all prices at checkout; never trust client totals. Line pricing and option rules live in one function, `priceLine` in `packages/shared` — the cart and the checkout service both use it.
- Every café-owned query is scoped by `cafeId`. Guests are identified only by the table's random `qrToken`.
- Order items snapshot product name, price and selected options.
- UI strings go through i18n (Turkish + English); menu content is Turkish only.
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
