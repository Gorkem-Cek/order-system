# Order System

A full-stack order management app built with TypeScript: customers browse products, place orders, and track their status; admins manage the catalog and move orders through their lifecycle.

> 🚧 Work in progress — built with [Claude Code](https://claude.com/claude-code).

## Features (planned)
- Product catalog with search and stock tracking
- Cart and checkout
- Order lifecycle: `pending → paid → shipped → delivered` (with cancellation)
- Admin dashboard for products and orders
- Authentication for customers and admins

## Tech stack
| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, TypeScript, PostgreSQL, Prisma, zod |
| Testing | Vitest, Playwright |
| Tooling | npm workspaces, ESLint, Prettier, GitHub Actions |

## Project structure
```
apps/
  api/        # REST API
  web/        # React frontend
packages/
  shared/     # Shared types and validation schemas
```

## Getting started
```bash
git clone https://github.com/Gorkem-Cek/order-system.git
cd order-system
cp .env.example .env
npm install
npm run dev
```

## Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start API and web in dev mode |
| `npm test` | Run unit/integration tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run lint` | Lint all workspaces |

## License
[MIT](LICENSE)
