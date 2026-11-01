# Wishlist

A self-hosted scrapbook for the things that catch your eye. Warm paper, serif titles, loosely arranged artwork, and little price stickers. No interface accent colors or icons.

Built with SvelteKit 3, Svelte 5, TypeScript, Node 24 and local SQLite. The authenticated MCP server lets your assistant collect finds, attach artwork and record price observations. The assistant handles research and image generation; the app stores and displays the results.

![A sample scrapbook](docs/preview/scrapbook.png)

## Run with Docker

```sh
cp .env.example .env
docker compose up --build -d
```

Open `http://localhost:3000`. Create an account with a password or a passkey. The `/demo` page shows an illustrative, read-only collection. Real accounts start empty.

For a public deployment, set `ORIGIN=https://wishlist.example.com` and `RP_ID=wishlist.example.com` in `.env`, and put an HTTPS reverse proxy in front of port 3000. Do not include a trailing slash in `ORIGIN`. Passkeys need HTTPS except on localhost, and depend on a stable domain. Compose binds port 3000 to localhost; keep the app behind your proxy. Run a single app replica against its local volume.

Data and images persist in the `wishlist-data` Docker volume at `/data`. Do not use `docker compose down -v` unless you intend to delete that volume.

## Local development

Requires Node 24 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The SQLite database and uploaded artwork are created in the ignored `data/` directory. `DATA_DIR` can override this location. For a production build outside Docker:

```sh
npm run check
npm run build
ORIGIN=http://localhost:3000 RP_ID=localhost npm start
```

## What works

- Password registration/sign-in and discoverable passkey registration, enrollment and sign-in.
- Profile preferences, password changes, passkey removal and session revocation.
- Folders, renaming, searchable paginated items, three presentation styles and display sizes.
- PNG/WebP uploads with bounded decoding and re-encoding to WebP; private local asset storage.
- Animated item dialogs, keyboard focus management, reduced motion and responsive layouts.
- Item editing, folder moves, private notes, public descriptions and recoverable trash.
- Sourced, dated price observations, currency-aware price labels and price history.
- Revocable and replaceable public view-only folder links, including revocation of image access.
- Bearer-authenticated Streamable HTTP MCP with read-only/read-write and optional folder scope.
- Revision checks, transactional item/initial-price saves and idempotency keys for retryable creates and price records.
- SQLite WAL, ownership foreign keys, consistent online backups and a restore-integrity checker.

## Connect an assistant

Open **Connect AI**, choose a name, permission level and folder scope, and create a token. Copy it immediately; only its hash is retained.

Configure a remote MCP client that supports bearer headers:

```json
{
  "mcpServers": {
    "wishlist": {
      "url": "https://wishlist.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_CONNECTION_TOKEN"
      }
    }
  }
}
```

Exact configuration syntax depends on the client. This release does not implement OAuth discovery/authorization and does not claim compatibility with OAuth-only clients. See [MCP details](docs/MCP.md).

Try: “Save a ceramic coffee cup in my wishlist. Make a transparent postage-stamp illustration, upload it, and record the price with the shop link and observation time.”

## Checks

```sh
npm run check
npm run build
npm test
npm run test:browser
```

Integration tests start a production server on port 4173 with an isolated temporary database. Browser checks use Chromium (`/usr/bin/chromium` by default; set `CHROMIUM_PATH` to another executable), port 4174, and temporary accounts. They include real WebAuthn challenge/signature verification through a virtual authenticator. Screenshots go to ignored `work/screenshots/`. `npm run test:docker` exercises the locally built `wishlist:local` image with a disposable container/volume and confirms restart persistence and backup integrity.

## Backup and restore

See [self-hosting and recovery](docs/SELF_HOSTING.md). Backups contain credential, session and connection-token hashes and private notes; keep them private.

## Current boundaries

No email delivery, email verification, password-reset service, or recovery codes yet. Keep another passkey or a password available; an operator cannot recover a lost passkey. There is no automatic product search, price checking, image generation, checkout or currency conversion in the server. Canvas placement is automatic; free dragging and nested folders are not included.

The included SVG illustrations are sample artwork only, not fetched products or generated representations of a user's purchases. User uploads are PNG/WebP; SVG uploads are not accepted.

The dependency lockfile is committed. The current production dependency audit has no reported vulnerabilities; the full development audit retains a low-severity advisory in the framework's build-time `deepmerge` chain, for which the current release has no patched update. Review dependencies when upgrading.

## Design

- [Specification and design decisions](docs/SPECIFICATION.md)
- [Original visual proposal](docs/scrapbook-design.svg)
