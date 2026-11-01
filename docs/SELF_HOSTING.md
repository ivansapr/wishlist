# Self-hosting and data recovery

## Deployment

Use Docker Compose as shown in the README. The app runs as the unprivileged Node user. `/data` stores `wishlist.sqlite`, its WAL files, and immutable artwork in `assets/`. Mount it on local persistent storage, with a single application replica. A reverse proxy should terminate HTTPS. The runtime entrypoint sets internal origin headers from `ORIGIN`, so it does not trust client-supplied host/protocol forwarding headers. The configured `ORIGIN` is the canonical browser origin and WebAuthn expected origin; `RP_ID` is its domain only.

SQLite enables foreign keys, WAL and a five-second busy timeout. Schema version two is created on startup. The additive v1-to-v2 migration introduces OAuth clients, pending requests, grants, codes and tokens without changing existing accounts, items or personal tokens. A newer unsupported schema version is rejected. Back up before installing future versions.

Auth attempts and uploads are rate-limited in SQLite. Behind a reverse proxy, configure adapter-node's `ADDRESS_HEADER` only if the proxy reliably overwrites that header and direct public access to the app port is blocked. Otherwise clients may share the proxy's IP rate limit. Do not trust client-provided forwarding headers directly.

Keep the database and volume accessible only to the app/operator. Apply the same restrictions to backups. The server has no shopping or AI provider credentials and requires no external service for its normal operation.

## Consistent backup

For a local Node deployment:

```sh
DATA_DIR=./data node scripts/backup.mjs /absolute/path/to/new-backup-directory
node scripts/restore-check.mjs /absolute/path/to/new-backup-directory
```

For Docker, use a separate backup mount (the directory must exist and be writable by container UID 1000):

```sh
mkdir -p backups
# Arrange ownership of backups/ for UID 1000 on your host.
docker compose run --rm --no-deps \
  -v "$(pwd)/backups:/backups" wishlist \
  node scripts/backup.mjs /backups/snapshot-001

docker compose run --rm --no-deps \
  -v "$(pwd)/backups:/backups:ro" wishlist \
  node scripts/restore-check.mjs /backups/snapshot-001
```

The backup destination must be a new directory outside the live data directory. The script uses SQLite's online backup API, then copies immutable assets. It is safe while the app is running because artwork files are never overwritten or physically deleted. Do not copy only `wishlist.sqlite` from a running app; committed changes may still be in its WAL. `restore-check` verifies integrity, ownership foreign keys and asset existence.

## Restore

Stop the application. Preserve the old volume as a rollback copy. Restore the snapshot's database and `assets/` into a new empty data volume/directory, with ownership writable by the app user (UID 1000 in Docker). Do not combine the backup database with WAL/SHM files from another database. Run `restore-check` against the restored directory before starting the app. Restart with the same origin and RP ID so enrolled passkeys remain valid. Confirm sign-in and a private item's artwork after restart.

Do not restore over a live database. Restore deliberately from a known snapshot: newly added records after that snapshot will not be present.

## OAuth hosting

No new environment variables are required. OAuth metadata and audience checks use `ORIGIN`; set it to your public HTTPS origin without a path or trailing slash. Keep it stable across restarts. Use the supplied server entrypoint (`npm start`, also used by Docker) so canonical-origin handling and cookie-independent token-form requests work correctly. Do not replace it with `node build`.

No upstream identity service, SMTP service or global OAuth secret is required. Existing Wishlist password/passkey accounts approve access. Clients dynamically register exact redirect URIs and receive their own identifiers. Registrations, grants, token hashes and refresh-reuse records survive restarts and are included in SQLite backups. Revoke unwanted grants in Connect AI. A restored older backup also restores its earlier revocation state, so review/revoke connections after a rollback.

## Authentication boundaries

Passwords use salted scrypt hashes. Session cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. Session tokens, public link tokens, personal MCP tokens, OAuth codes/access/refresh tokens and confidential-client secrets are stored hashed. Passkeys use required user verification and expiring, single-use challenges. Sessions expire after 30 days. Password changes revoke other sessions. Removing the final passkey is refused if there is no password.

Email verification and email-based account recovery are not implemented. For a personal deployment, use a second passkey or keep a password; do not rely on future email recovery. Public deployments allow account registration; registration is not currently invite-gated. Public folder links are unlisted/noindex and read-only, but anyone receiving a live link can view or copy its public content. Revocation prevents future app access, not copies already saved by a viewer.

## Managed build environments

Dockerfile optionally accepts a BuildKit secret `proxy_ca` for environments using an HTTPS proxy. It extends Node's trust only for dependency installation and does not embed the certificate in the runtime image. Ordinary self-hosting requires no build secret.
