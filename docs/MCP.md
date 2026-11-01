# Wishlist MCP

Endpoint: `POST /mcp`, Streamable HTTP, stateless JSON responses. Uses the official Model Context Protocol TypeScript SDK. Clients accept `application/json, text/event-stream` and authenticate with OAuth access tokens or existing personal connection tokens.

## OAuth connection

Point an OAuth-capable MCP client at `https://wishlist.example.com/mcp`. Unauthenticated requests return 401 with a `WWW-Authenticate` protected-resource metadata URL. The client discovers this app's authorization server, registers its redirect URIs, then opens Wishlist for sign-in and consent. The owner chooses read-only/edit access and all folders or one folder. The consent page shows the client-supplied name, actual return origin and signed-in account; names are not independently verified.

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 resource metadata; root variant also available |
| `/.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata |
| `/oauth/register` | RFC 7591 dynamic client registration (JSON) |
| `/oauth/authorize` | Browser sign-in and explicit consent |
| `/oauth/token` | Authorization code exchange and refresh (form encoded) |
| `/oauth/revoke` | RFC 7009 connection revocation (form encoded) |

Only authorization-code flow with mandatory S256 PKCE is supported. Redirect URIs must match registration exactly and use HTTPS, or HTTP loopback for local clients. Wildcards, credentials and fragments are refused. A browser-bound, expiring authorization request survives password/passkey sign-in; changing accounts cannot reuse another account's consent. Cancel returns `access_denied` and preserves the client's state. Successful redirects include the issuer (`iss`).

Scopes are `wishlist:read` and `wishlist:write`; write includes read. A client can request both, and the owner can reduce access before granting it. Without a requested scope the consent page offers both, with explicit owner approval required. The resource indicator is the canonical `${ORIGIN}/mcp`; a supplied different resource is rejected. For compatibility, omission binds to that same resource. Access tokens are checked against the stored audience and current server origin.

Access tokens last at most one hour. Refresh tokens rotate on every successful refresh. Reusing a consumed refresh token revokes the entire connection, including its outstanding access tokens. Grants expire after 30 days and then need consent again. Refresh can reduce scopes but cannot increase them or change the granted folder. Authorization codes last three minutes and are single-use; replay with valid client/redirect/PKCE revokes the grant. Token/code secrets are stored hashed.

Public clients register `token_endpoint_auth_method=none`. If omitted, registration defaults to `client_secret_basic`. Confidential clients can use `client_secret_post` or `client_secret_basic`; secrets are returned once, stored hashed and checked against the registered authentication method. The app has no global OAuth signing/client secret to configure: opaque tokens and registrations live in SQLite.

The owner can revoke a grant under **Connect AI → OAuth connections**. The protocol revocation endpoint invalidates that entire connection; unknown tokens return success and one client cannot revoke another client's connection. Browser sessions alone never authenticate MCP. Existing manually created connection tokens remain supported.

OAuth protocol endpoints, discovery and MCP support CORS without credentialed browser cookies. Account and consent mutations keep same-origin checks. The supplied `npm start` / Docker entrypoint normalizes only cookie-independent OAuth protocol POSTs for SvelteKit's form-origin gate; keep that entrypoint when self-hosting. No authorization request can grant account, sharing or connection-management access.

Tested with the official MCP SDK for discovery, dynamic registration, exchange, refresh and tool calls. OAuth client metadata document URLs (CIMD), external identity providers, OpenID Connect, implicit flow, client credentials grants and device-code grants are not implemented. No specific third-party client account was used to test its connection UI.

## Tools

| Tool | Action |
| --- | --- |
| `list_folders` | List folders accessible to the connection |
| `create_folder`, `update_folder` | Create or rename; folder-scoped connections cannot create folders |
| `list_items` | Filter by folder; offset/limit pagination, maximum 100 |
| `get_item` | Fetch details, current revision and price observations |
| `create_item` | Save title and folder, optional fields and idempotency key |
| `update_item` | Patch permitted fields using current revision |
| `move_item` | Move using current revision; both folders must be in scope |
| `delete_item`, `restore_item` | Soft delete or restore an item |
| `list_price_observations` | Read dated observations |
| `record_price_observation` | Store a sourced price, optional deal/expiry/shipping and idempotency key |
| `prepare_asset_upload` | Return binary upload instructions |
| `attach_item_asset` | Attach an owned uploaded asset using current item revision |

Sharing settings, credentials and connection management are web-only.

## Images

The assistant generates its own image in the item's selected style (`stamp`, `sticker`, `object`). Ask for a transparent background and no price/title text baked into the pixels. Keep recognizable product details; do not present artistic artwork as a verified product photograph.

1. Call `prepare_asset_upload`.
2. POST PNG or WebP bytes to the returned `/api/upload` URL with the same bearer token and matching Content-Type. Maximum upload is 5 MiB, decoded pixel budget 16,777,216; animated inputs are flattened. Output is resized within 1600 × 1600 and re-encoded to WebP.
3. Read the returned asset `id` and use `attach_item_asset` with the item's latest revision.

No URL fetching or server image-generation keys are needed. A client needs a binary HTTP upload capability in addition to MCP. The server stores the previous art until the replacement is attached successfully.

## Prices and retry behavior

Amounts are integers in currency minor units: EUR 38.50 is `3850`, JPY 380 is `380`. Currency uses ISO codes. Supply `observed_at` as an offset-aware ISO timestamp, source URL, and merchant when known. Timestamps are normalized to UTC. The server does not verify the commercial claim or scrape the source. Future observations and expiry before observation time are rejected.

Displayed price is the newest observation whose deal has not expired. History keeps expired and older entries, with sources and dates. Prices across currencies are not compared or converted.

Use a unique `idempotency_key` for each logical create or price record. Retry with the same key and the same fields to receive the original response. Reusing a key for another payload or folder scope yields a conflict. Item updates and deletes require `revision`; a stale revision returns a conflict rather than overwriting someone else's edit. Fetch the current item before resolving it.

Errors returned by tools include `isError` and a JSON error/status; HTTP authentication failures use 401/403. Standard SDK initialization, tool discovery and tool calls are supported. Persistent server notification streams are not provided.
