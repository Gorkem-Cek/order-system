# Deploying to Railway

The app runs as one Railway service built from the `Dockerfile`: the API serves the built web app. `railway.json` holds the build, health check and pre-deploy settings. Every deploy first runs `npm run release`, which applies database migrations and creates the super-admin the first time.

Run exactly one replica. Live order updates are held in the server's memory, so a second instance wouldn't see them.

## First deploy

1. In Railway, create a project from this GitHub repository.
2. Add a PostgreSQL database to the project.
3. Add a persistent volume to the app service, mounted at `/data`.
4. Under the app service's **Settings → Networking**, generate a public domain.
5. Under the app service's **Variables**, set:

| Variable              | Value                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`        | `${{Postgres.DATABASE_URL}}`                                      |
| `UPLOAD_DIR`          | `/data/uploads`                                                   |
| `RAILWAY_RUN_UID`     | `0` (lets the app write to the volume)                            |
| `SUPERADMIN_EMAIL`    | The email you'll log in with                                      |
| `SUPERADMIN_PASSWORD` | A strong password you choose, at least 8 characters               |
| `PUBLIC_URL`          | Only with your own domain, e.g. `https://example.com` (see below) |

6. Deploy, then log in at `/staff/login` and check that `/admin` opens.
7. Delete `SUPERADMIN_PASSWORD` from the variables. It's only read the first time.

## Your own domain

Add it under **Settings → Networking**, set `PUBLIC_URL`, and redeploy.

**Choose the final address before printing QR codes.** Printed codes contain it, so changing it later means reprinting them. Without `PUBLIC_URL` the codes use the Railway address.

## Later

- **Forgot the super-admin password:** open a shell in the service with `railway ssh`, then run `SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… node dist/create-super-admin.js`.
- **Payments are still mocked:** no money is taken until a real provider is added, so don't take real orders yet.
- **Database backups:** check that they're enabled for the Postgres service before cafés rely on the system.
