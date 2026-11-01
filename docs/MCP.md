# Wishlist MCP

Endpoint: `POST /mcp`, Streamable HTTP, stateless JSON responses. Uses the official Model Context Protocol TypeScript SDK. Clients must support `Authorization: Bearer <token>` and accept `application/json, text/event-stream`.

Every request resolves the current token from SQLite. Revocation takes effect on the next request. Public sharing tokens cannot authenticate MCP. Browser sessions alone do not authenticate `/mcp`. Cross-origin browser requests are rejected. No permissive CORS is enabled.

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
