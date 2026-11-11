# Web conventions

- Web: features live in `apps/web/src/features/<feature>/` (components + `*.module.css` + hooks); shared UI in `src/components`. Data fetching uses TanStack Query with `apiFetch` (`src/lib/api.ts`), which validates responses with the shared zod schemas. Routes are in `src/routes.tsx`.
- Image uploads in the web app use `ImageField` (`src/components/ImageField.tsx`); it saves on pick and maps upload errors to messages.
- Web UI text: add keys to `src/i18n/tr.ts` (source of truth, typed) and `src/i18n/en.ts`. Brand colour is applied via `brandStyle()` CSS variables (`--brand`, `--brand-contrast`).
- Web tests render real routes with `renderRoute()`, stub `fetch` with `mockFetch()` and live events with `FakeEventSource` (`src/test/render.tsx`).
- The super-admin's home is `/admin` (café list, create, reset password, (de)activate); "Paneli aç" stores the acting café (`features/staff/acting-cafe.ts`) and opens `/staff`.
- Staff pages render inside `StaffLayout` (`/staff`), which requires a login and provides `useStaff()` (user, café, `staffFetch` that adds `X-Cafe-Id` for a super-admin acting as a café). Print-only pages hide the top bar via `@media print`.
