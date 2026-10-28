# Siparİş

QR table ordering for cafés. Guests scan the QR code on their table, browse the café's menu, pay on the website, and the order appears instantly on the staff screen. One shared (multi-tenant) system serves many cafés.

> 🚧 Work in progress — built with [Claude Code](https://claude.com/claude-code). Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Features (MVP, planned)

- Per-table QR codes that open the café's menu, no login needed
- Menu with categories, search, product options (size, milk, extras) and item notes
- Cart and checkout with a mock payment (real payments later)
- Live staff order board with sound alerts: `new → preparing → served` (with cancellation)
- "Call waiter" button
- Staff panel: menu, prices, availability, tables and printable QR codes, café branding
- Super-admin panel to manage all cafés
- Turkish interface by default, with an English toggle

## Tech stack

| Layer    | Tech                                             |
| -------- | ------------------------------------------------ |
| Frontend | React, Vite, TypeScript                          |
| Backend  | Node.js, Fastify, PostgreSQL, Prisma, zod        |
| Testing  | Vitest, Playwright                               |
| Tooling  | npm workspaces, ESLint, Prettier, GitHub Actions |

## Project structure

```
apps/
  api/        # Fastify REST API
  web/        # React frontend (customer menu + staff panel)
packages/
  shared/     # Shared types, zod schemas and helpers
docs/
  SPEC.md     # Product spec
```

## Getting started

Requires Node.js 22.12+ (24 LTS recommended) and PostgreSQL 17.

```bash
git clone https://github.com/Gorkem-Cek/order-system.git
cd order-system
cp .env.example .env   # then set DATABASE_URL to your local database
npm install
npm run dev            # web on http://localhost:5173, API on http://localhost:3000
```

## Scripts

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start API and web in dev mode       |
| `npm run build`        | Build web and API                   |
| `npm test`             | Run unit/integration tests          |
| `npm run lint`         | Lint all workspaces                 |
| `npm run typecheck`    | Type-check all workspaces           |
| `npm run format`       | Format everything with Prettier     |
| `npm run format:check` | Check formatting (runs in CI)       |
| `npm run test:e2e`     | Playwright end-to-end tests (later) |

## License

[MIT](LICENSE)
