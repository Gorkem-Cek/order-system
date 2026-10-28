# Siparİş — Product Spec (MVP)

QR table-ordering for cafés. Guests scan a QR code on their table, browse the café's digital menu, pay on the website, and the order appears instantly on the staff screen. Sold to multiple cafés as one shared (multi-tenant) system.

The name is written **Siparİş**, with a capital dotted **İ** as the second i.

Status: **confirmed** (2026-10-28).

---

## 1. Roles

| Role                                                        | Login                                            | Can do                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Customer (guest)**                                        | None                                             | Open a table's menu via QR, search, add to cart with options + notes, pay (fake), call the waiter                                                                                   |
| **Café staff** (waiters and owners — identical permissions) | One **shared login per café** (email + password) | Live order board, change order status, answer waiter calls, manage menu/prices/availability/options, manage tables + print QR codes, edit café branding, change the café's password |
| **Super-admin** (you)                                       | Email + password                                 | Everything, across all cafés: create/deactivate cafés, create a café's login, reset its password, open any café's admin panel                                                       |

There are no individual staff accounts in the MVP. The data model still allows several logins per café, so individual accounts can be added later without a migration.

## 2. Customer flow

1. Scan the table QR → `https://<domain>/m/<tableToken>`. The token is random and unguessable, so it identifies both the café and the table.
2. Menu page: café logo and colours, category tabs, search box, products (photo if present, name, description, price). Unavailable products are greyed out and can't be added.
3. Product sheet: choose options (e.g. size, milk type, extra shot), set quantity, add an item note → add to cart.
4. Cart: edit quantities, add an order note, see the total.
5. Checkout → fake payment form → on success the order is created and sent to staff → confirmation screen ("Siparişiniz alındı", with order number).
6. Each new order is paid separately (pay-before-send). There are no table sessions or tabs.
7. A **"Garson Çağır" (Call waiter)** button is always visible. It has a 60-second cooldown so it can't be spammed.

Customers don't see order progress after the confirmation screen.

## 3. Staff flow

- **Orders board** (main screen, desktop-first, works on tablets): two columns, **Yeni → Hazırlanıyor**. New orders arrive in real time with a **sound alert** and a highlight. Each card shows the table, time, items with options and notes, the order note and the total.
- Status changes: one click advances the order. Marking it **Servis Edildi** removes it from the board immediately. **Cancel** is allowed from `new` or `preparing`, and the refund is handled manually for now.
- An **Order history** page lists all orders (served and cancelled), filterable by date and status.
- **Waiter calls**: a panel at the top of the board with sound, showing "Masa 5 garson çağırıyor" and a "Tamam" button to resolve.
- **Menu management**: categories (create, rename, reorder, delete), products (name, description, price, optional photo, category, order), option groups, and an availability toggle.
- **Tables**: create, rename and delete tables; print a single QR or a printable sheet with all of them; regenerate a table's QR token if a code leaks.
- **Settings**: café name, logo, primary colour, cover image, change the café's password.

## 4. Super-admin

- Café list: create a café (name, slug, shared login email + password), reset its password, activate or deactivate it. A deactivated café's menu shows "Hizmet dışı" and refuses orders.
- "Open as" any café to use its admin panel.

## 5. Order status flow

```
new ──▶ preparing ──▶ served
 │          │
 └──────────┴──▶ cancelled
```

- An order only exists once payment has succeeded, so every order starts as `new` + `paymentStatus = paid`.
- Transitions are enforced in exactly one place: the **order service**.

## 6. Data model (Prisma, PostgreSQL)

All money is **integer kuruş** (₺12,50 = `1250`). Every café-owned row has a `cafeId`, and every query is scoped by it.

- **Cafe**: id, name, slug (unique), logoUrl?, coverUrl?, primaryColor, isActive, createdAt
- **User**: id, email (unique), passwordHash, name, role (`SUPER_ADMIN` | `STAFF`), cafeId? (null for super-admin), isActive. In the MVP each café has exactly one `STAFF` user, which is the shared login.
- **Table**: id, cafeId, name (e.g. "Masa 5", "Bahçe 2"), qrToken (unique, random), isActive
- **Category**: id, cafeId, name, sortOrder
- **Product**: id, cafeId, categoryId, name, description?, priceKurus, imageUrl?, isAvailable, sortOrder, deletedAt? (soft delete keeps old orders intact)
- **OptionGroup**: id, productId, name (e.g. "Boyut"), minSelect, maxSelect, sortOrder. Size = min 1 / max 1, extras = min 0 / max N.
- **Option**: id, optionGroupId, name (e.g. "Büyük"), priceDeltaKurus, isAvailable, sortOrder
- **Order**: id, cafeId, tableId, orderNumber (sequential per café per day), status, note?, totalKurus, paymentStatus, paymentRef, createdAt, updatedAt
- **OrderItem**: id, orderId, productId, productName (snapshot), unitPriceKurus (snapshot incl. options), quantity, note?, selectedOptions (JSON snapshot: group name, option name, delta)
- **WaiterCall**: id, cafeId, tableId, status (`open` | `resolved`), createdAt, resolvedAt?

Rules:

- The **server recalculates every price** at checkout from the database. Totals sent by the client are ignored.
- Order items store snapshots, so later menu or price edits don't change past orders.

## 7. Payments (fake for MVP)

- A `PaymentProvider` interface with a `MockPaymentProvider`: a card form that always succeeds, with a special test card that fails so the error path can be tested.
- A real provider (iyzico, which suits Turkish lira) plugs in later behind the same interface.
- Checkout order: validate cart → compute total → charge → create the order (`new`) → notify staff in real time.

## 8. Language

- Turkish is the default and English is a toggle for the **interface only** (buttons, labels, messages). Uses `react-i18next`.
- Menu content (product and category names) is Turkish only for now. The data model can add translations later.
- Prices are formatted as `₺1.250,00` (tr-TR).

## 9. Tech and architecture

Per CLAUDE.md, plus these decisions:

- **API: Fastify** (TypeScript, zod-validated) with route → service → repository layering.
- **Real-time: Server-Sent Events (SSE)** from the API to staff screens for new orders, status changes and waiter calls. This is simpler than WebSockets and enough for one-way push.
- **Auth:** staff/super-admin log in with email + password (argon2 hashing) and get an httpOnly session cookie. Guests are identified only by the table token.
- **Images:** uploaded to S3-compatible object storage (Cloudflare R2), resized on upload, max 5 MB.
- **QR codes:** generated server-side (`qrcode` package). The print page is a print-optimised HTML sheet.
- **Web:** React + Vite. Customer pages are mobile-first and staff pages desktop/tablet-first. Each café's branding is applied through CSS variables.
- **Seed:** a demo café ("Demo Kafe") with tables, categories and an example catalog that uses options.

## 10. Deployment (recommendation)

**Railway**: one service runs the Fastify API and serves the built web app, alongside a managed PostgreSQL and Cloudflare R2 for images.

- SSE needs a long-running server, which rules out serverless hosts like Vercel for the API.
- It's cheap at the start, deploys from GitHub, and scales up later. Fly.io or a VPS with Docker remain options if needed.

## 11. Out of scope for MVP

Real payments, tax/VAT, reports and analytics, customer order tracking, multi-language menu content, fully custom per-café layouts, printer/kitchen display integrations, refunds automation.

## 12. Build order (each step = one small PR)

1. Monorepo setup: workspaces, TS, ESLint/Prettier, Vitest, CI green
2. Prisma setup + data model + migrations + demo seed
3. Shared zod schemas (menu, cart, order, auth)
4. Staff auth + super-admin café creation
5. Public menu API + customer menu/search/product sheet/cart UI (TR/EN)
6. Checkout + mock payment + order service with status rules (heavily tested)
7. SSE + live orders board with sound + status changes + cancel
8. Waiter calls (customer button → staff panel)
9. Menu management (categories, products, options, availability, image upload)
10. Tables + QR generation + print sheet
11. Café branding settings + password change + order history
12. Playwright end-to-end: scan → order → pay → appears on board → served
13. Deploy to Railway

## 13. Later (post-MVP ideas)

Individual staff accounts, real payments (iyzico), reports, English menu content, custom per-café layouts.
