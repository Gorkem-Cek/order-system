# Siparİş

QR table-ordering for cafés (multi-tenant). Guests scan a table QR, browse the café's menu, pay (mocked for now) and the order appears live on the staff board; café staff manage orders, menu and tables; a super-admin manages all cafés. Full product spec: `docs/SPEC.md` — read it before feature work.

## Stack

- **Deploy:** Railway (API serves built web app) + managed Postgres + a persistent volume for images (see `docs/DEPLOY.md`)

## Commands (run from repo root)

- `npm run lint` / `npm run typecheck` / `npm test` / `npm run format:check` — must all pass before committing
- Local DB: PostgreSQL 17 on `localhost:5432`, database `siparis`; set `DATABASE_URL` in `.env`
- `npm run db:migrate -- --name <change>` — create + apply a migration after editing `apps/api/prisma/schema.prisma` (also regenerates the Prisma client; Prisma 7 no longer does that itself)
- `npm run db:seed` — (re)create the demo café "Demo Kafe" with dev logins (printed by the seed)
- The Prisma client is generated into `apps/api/src/generated` on `npm install` (not committed)
- `npm run admin:create -w @siparis/api` — create/reset the super-admin from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`

## Domain rules

- Order status flow: `new → preparing → served`; `cancelled` allowed only from `new` or `preparing`. Enforce in one place (the order service), never in route handlers.
- Orders are created only after payment succeeds (pay-before-send): `ordersService.checkout` prices lines from the DB, charges via the `PaymentProvider` (`apps/api/src/modules/payments`, mock for now), then creates the order; it refunds if saving fails. Order numbers restart daily (Istanbul day, `businessDate()`), allocated under a per-café advisory lock.
- Status transitions live only in `apps/api/src/modules/orders/order-status.ts` (`canTransition`).
- Real-time: services publish `StaffEvent`s (`packages/shared/src/events.ts`) on the in-process `EventBus` (`apps/api/src/lib/event-bus.ts`); `GET /api/staff/events` streams them per café as SSE. Single API instance only — multiple instances would need Postgres LISTEN/NOTIFY behind the same bus. The web board patches the TanStack Query cache from events and refetches on every (re)connect.
- Money is stored as integer kuruş (TRY), never floats. The server recalculates all prices at checkout; never trust client totals. Line pricing and option rules live in one function, `priceLine` in `packages/shared` — the cart and the checkout service both use it.
- Every café-owned query is scoped by `cafeId`. Guests are identified only by the table's random `qrToken`.
- Order items snapshot product name, price and selected options.
- UI strings go through i18n (Turkish + English); menu content is Turkish only.
- Request/response shapes live in `packages/shared` and are imported by both api and web.

## Conventions

- Every new endpoint or service function gets tests in the same change.
- Never commit secrets; config comes from `.env` (see `.env.example`).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Work on feature branches and open a PR against `main`; keep PRs small.

## Working notes for Claude

- Plan before large changes; ask if a requirement is ambiguous.
- Use the context7 MCP server to check current library docs before using unfamiliar APIs.
- Use the playwright MCP server to visually check UI changes in the running dev server.
- Update this file when commands or structure change.
