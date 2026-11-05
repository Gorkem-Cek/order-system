# Siparİş

QR table-ordering for cafés (multi-tenant). Guests scan a table QR, browse the café's menu, pay (mocked for now) and the order appears live on the staff board; café staff manage orders, menu and tables; a super-admin manages all cafés. Full product spec: `docs/SPEC.md` — read it before feature work.

## Stack

- **Language:** TypeScript (strict mode) everywhere, Node.js 22.22+ (24 LTS recommended)
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
- `npm run db:migrate -- --name <change>` — create + apply a migration after editing `apps/api/prisma/schema.prisma` (also regenerates the Prisma client; Prisma 7 no longer does that itself)
- `npm run db:seed` — (re)create the demo café "Demo Kafe" with dev logins (printed by the seed)
- `npm run db:reset` / `npm run db:deploy` / `npm run db:studio` — reset dev DB / apply migrations / browse data
- The Prisma client is generated into `apps/api/src/generated` on `npm install` (not committed)
- `npm run admin:create -w @siparis/api` — create/reset the super-admin from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`

## Domain rules

- Order status flow: `new → preparing → served`; `cancelled` allowed only from `new` or `preparing`. Enforce in one place (the order service), never in route handlers.
- Orders are created only after payment succeeds (pay-before-send): `ordersService.checkout` prices lines from the DB, charges via the `PaymentProvider` (`apps/api/src/modules/payments`, mock for now), then creates the order; it refunds if saving fails. Order numbers restart daily (Istanbul day, `businessDate()`), allocated under a per-café advisory lock.
- Status transitions live only in `apps/api/src/modules/orders/order-status.ts` (`canTransition`).
- Images: `processImage()` (`apps/api/src/lib/images.ts`) validates by content, resizes to ≤1200px and stores WebP without metadata; files go through the `FileStorage` interface (`apps/api/src/lib/storage.ts`) — local disk served at `/uploads` in dev, an S3-compatible bucket (R2) to be added for production.
- Tables: the QR code links to `<PUBLIC_URL>/m/<qrToken>` (`PUBLIC_URL` in `.env`); the API renders it as SVG (`apps/api/src/lib/qr.ts`). Regenerating a table's token invalidates the old printed code. Deleting a table keeps its orders (they snapshot the table name) and resolves its open waiter call.
- Real-time: services publish `StaffEvent`s (`packages/shared/src/events.ts`) on the in-process `EventBus` (`apps/api/src/lib/event-bus.ts`); `GET /api/staff/events` streams them per café as SSE. Single API instance only — multiple instances would need Postgres LISTEN/NOTIFY behind the same bus. The web board patches the TanStack Query cache from events and refetches on every (re)connect.
- Money is stored as integer kuruş (TRY), never floats. The server recalculates all prices at checkout; never trust client totals. Line pricing and option rules live in one function, `priceLine` in `packages/shared` — the cart and the checkout service both use it.
- Every café-owned query is scoped by `cafeId`. Guests are identified only by the table's random `qrToken`.
- Order items snapshot product name, price and selected options.
- UI strings go through i18n (Turkish + English); menu content is Turkish only.
- Request/response shapes live in `packages/shared` and are imported by both api and web.

## Conventions

- Small, focused modules; route → service → repository layering in the API, grouped per feature in `apps/api/src/modules/<feature>/` (`*.routes.ts`, `*.service.ts`, `*.repository.ts`). Services receive repositories via factory functions; `buildApp({ config, prisma })` wires them.
- Auth: DB-backed sessions in an httpOnly cookie. Guard routes with `requireUser`, `requireSuperAdmin` or `requireCafe` (staff routes; super-admin picks the café via the `X-Cafe-Id` header) from `apps/api/src/plugins/auth.ts`. Throw `AppError` (`apps/api/src/lib/errors.ts`) for expected errors.
- API integration tests use `createTestContext()` from `apps/api/src/test/helpers.ts` against the real database.
- Web: features live in `apps/web/src/features/<feature>/` (components + `*.module.css` + hooks); shared UI in `src/components`. Data fetching uses TanStack Query with `apiFetch` (`src/lib/api.ts`), which validates responses with the shared zod schemas. Routes are in `src/routes.tsx`.
- Image uploads in the web app use `ImageField` (`src/components/ImageField.tsx`); it saves on pick and maps upload errors to messages.
- Web UI text: add keys to `src/i18n/tr.ts` (source of truth, typed) and `src/i18n/en.ts`. Brand colour is applied via `brandStyle()` CSS variables (`--brand`, `--brand-contrast`).
- Web tests render real routes with `renderRoute()`, stub `fetch` with `mockFetch()` and live events with `FakeEventSource` (`src/test/render.tsx`).
- The super-admin's home is `/admin` (café list, create, reset password, (de)activate); "Paneli aç" stores the acting café (`features/staff/acting-cafe.ts`) and opens `/staff`.
- Staff pages render inside `StaffLayout` (`/staff`), which requires a login and provides `useStaff()` (user, café, `staffFetch` that adds `X-Cafe-Id` for a super-admin acting as a café). Print-only pages hide the top bar via `@media print`.
- Every new endpoint or service function gets tests in the same change.
- Never commit secrets; config comes from `.env` (see `.env.example`).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Work on feature branches and open a PR against `main`; keep PRs small.

## Working notes for Claude

- Plan before large changes; ask if a requirement is ambiguous.
- Use the context7 MCP server to check current library docs before using unfamiliar APIs.
- Use the playwright MCP server to visually check UI changes in the running dev server.
- Update this file when commands or structure change.
