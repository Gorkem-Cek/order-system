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
| `PAYMENT_SECRET_KEY`  | 32 random bytes, base64 (see **Payments** below)    |

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

## Payments (iyzico)

Each café is paid into **its own iyzico merchant account**. Guests pay on iyzico's hosted page, so card details never reach Siparİş, and the guest's name, email and phone are passed to iyzico without being stored.

**One-time setup:** set `PAYMENT_SECRET_KEY`. It encrypts every café's iyzico secret key in the database. Generate it without showing it anywhere, for example:

```sh
node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))'   | railway variable set PAYMENT_SECRET_KEY --stdin --service <app service>
```

**Never change or delete it.** The saved keys can't be decrypted without it, and every café would have to re-enter its keys.

**Connecting a café** (super-admin only): Admin → the café → **Ödeme ayarları**.

1. Choose the mode, enter the café's address and city, and paste its API key and secret key. They're in the café's iyzico panel under **Settings → Merchant Settings → API Keys**.
2. Keys are checked with iyzico before they're saved.
3. Test with **Sandbox** keys from https://sandbox-merchant.iyzipay.com first, using iyzico's test card `5528 7900 0000 0008` (any future expiry, any CVC). Then switch the mode to **Live** and enter the live keys. Changing the mode always asks for new keys.

**What happens when:**

- **Guest pays:** the order appears only after the server has re-checked the payment with iyzico. If the guest closes the tab before coming back, the server re-checks pending payments every 2 minutes.
- **Staff cancel a paid order:** the money goes back automatically. On the day of payment the payment is voided; later, each item is refunded.
- **A refund fails:** the board shows a warning, and history marks the order "İade yapılamadı". Refund it by hand in the café's iyzico panel.
- **Cafés without iyzico** can't take orders. `ALLOW_MOCK_PAYMENTS=true` turns the fake card back on for demos. Never set it while real cafés use the site: guests could then order without paying.

## Your own domain

Add it under **Settings → Networking**, set the `PUBLIC_URL` variable (e.g. `https://example.com`), and redeploy.

**Choose the final address before printing QR codes.** Printed codes contain it, so changing it later means reprinting them. Without `PUBLIC_URL`, the codes use the Railway address.

## Later

- **Forgot the super-admin password:** open a shell in the service with `railway ssh`, then run `SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… node dist/create-super-admin.js`.
- **Going live with payments:** each café needs its own live iyzico merchant account (iyzico approves the business first). Before the first real orders, do one small real payment and cancel it, to see the refund arrive.
- **Backups:** check that they're enabled for the Postgres database and the volume before cafés rely on the system.
