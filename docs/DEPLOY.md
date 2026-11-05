# Deploying to Railway

The app runs as one Railway service built from the `Dockerfile`, which Railway detects automatically. The API serves the built web app.

Keep it at one replica. Live order updates are held in the server's memory, and Railway doesn't allow replicas on a service with a volume anyway. Expect a few seconds of downtime on each deploy; open staff boards reconnect by themselves.

## First deploy

1. In Railway, create a project from this GitHub repository.
2. Add a PostgreSQL database to the project.
3. Add a volume to the app service, mounted at `/data`.
4. In the app service's **Variables**, set these, then deploy the staged changes:

| Variable              | Value                                               |
| --------------------- | --------------------------------------------------- |
| `DATABASE_URL`        | `${{Postgres.DATABASE_URL}}`                        |
| `PORT`                | `8080`                                              |
| `UPLOAD_DIR`          | `/data/uploads`                                     |
| `RAILWAY_RUN_UID`     | `0` (lets the app write to the volume)              |
| `SUPERADMIN_EMAIL`    | The email you'll log in with                        |
| `SUPERADMIN_PASSWORD` | A strong password you choose, at least 8 characters |

5. In the app service's **Settings**, set these. They live in the dashboard, not in the repository:

| Setting            | Value             |
| ------------------ | ----------------- |
| Pre-deploy command | `npm run release` |
| Healthcheck path   | `/api/health`     |

The pre-deploy command applies database migrations and creates the super-admin the first time. Without it the app has no tables.

6. Under **Settings → Networking → Public Networking**, choose **Generate Domain**. Check that its target port is `8080`.
7. Redeploy, so the app picks up the new domain for its QR codes.
8. Log in at `/staff/login` and check that `/admin` opens.
9. Delete `SUPERADMIN_PASSWORD` from the variables. It's only read the first time.

## After the first deploy

Check these once on the live site:

- A photo uploaded in the menu editor is still there after a redeploy.
- A printed table's QR code opens that table's menu on a phone.
- Wrong logins get blocked after 10 attempts, even when each request sends a different made-up `X-Real-IP`. If they don't, Railway isn't overwriting that header and the rate limits need another look.

## Your own domain

Add it under **Settings → Networking**, set the `PUBLIC_URL` variable (e.g. `https://example.com`), and redeploy.

**Choose the final address before printing QR codes.** Printed codes contain it, so changing it later means reprinting them. Without `PUBLIC_URL`, the codes use the Railway address.

## Later

- **Forgot the super-admin password:** open a shell in the service with `railway ssh`, then run `SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… node dist/create-super-admin.js`.
- **Payments are still mocked:** no money is taken until a real provider is added, so don't take real orders yet.
- **Backups:** check that they're enabled for the Postgres database and the volume before cafés rely on the system.
