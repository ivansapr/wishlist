# Wishlist — product specification and design

Status: original design specification, 1 November 2026. Repository: ivansapr/wishlist.
Implementation has started. See README.md for current capabilities and boundaries; recovery codes and free dragging remain future work. MCP OAuth authorization code flow with PKCE is implemented; see docs/MCP.md.

## Product
A personal scrapbook of things worth saving. People collect items into folders, connect an AI through MCP, and share a folder with a public, view-only link. The AI researches products, generates images, finds deals and records prices. The application stores and presents those results; it has no search engine, scraper, image-generation service or scheduled price checker.

## Confirmed direction
- SvelteKit with TypeScript, self-hosted using Docker, local SQLite database.
- Accounts support password and passkey authentication.
- Warm off-white interface, neutral ink, no interface accent colors or icons.
- Serif headings, sans-serif controls. Item artwork can retain natural color.
- Loose scrapbook canvas with varied item sizes and slight rotations.
- Each item chooses postage-stamp, sticker or 3D presentation; AI supplies a transparent image. Owners can replace or regenerate artwork through their AI.
- Image and title on the canvas, with a paper price sticker overlapping the artwork.
- Persistent text sidebar for folders.
- Opening an item animates its artwork into a modal with a small details card nearby.
- Private folders by default. Public links allow viewing without an account.

## Proposed defaults
These are design recommendations, not additional confirmed requirements: email as login identifier; one folder per item; automatically composed canvas rather than free dragging; no nested folders in version one; newest items first; no cross-currency totals; public links unlisted and excluded from indexing; account profile private. App name remains Wishlist until renamed.

## Screens and behavior
### My scrapbook
Desktop sidebar is 224px wide: Wishlist, All items, folder names and item counts, New folder, Profile, Connect AI. Selected folder uses a thin underline and darker text, never an icon. Main header has folder title, item count, Share and Add item. Provide ample empty space around items, with consistent readable title baselines despite rotated artwork. Price stickers show currency and amount; unknown prices show no sticker.

Canvas uses deterministic placement from item ID and saved display size, so it does not reshuffle on each visit. Three size presets, rotations between -5 and +5 degrees, collision-free clickable areas, and no overlap between adjacent items. Sorting changes ordering, not arbitrary free coordinates. Small screens use a two-column scrapbook, collapsing to one column when needed. Folders opens a text navigation drawer. No horizontal canvas scrolling.

### Item dialog
Selecting an item lifts and enlarges the same image into a centered composition. Artwork sits left, a small paper details panel right. Panel shows title, latest recorded price, source link, notes, folder, presentation style, and dated price observations. Owner controls: Edit, Replace image, Move, Delete. Public viewers see only the public projection. Close is a visible text button; Escape closes, focus stays in the dialog and returns to the originating item. At narrow widths stack image over panel and allow internal scrolling.

Animation proposal: 280ms transform/opacity transition with a soft ease-out; reverse on close when origin remains visible. Reduced-motion mode uses an immediate transition. A simple fade is the fallback when shared-element animation is unavailable. No idle floating, parallax or continuous movement.

### Add and edit
A compact dialog asks for title, optional product URL, folder, price/currency, notes and presentation. Add accepts an uploaded image or saves a text-first item awaiting AI artwork. It does not imply that the server can generate images. Connect AI explains how to ask the connected assistant to research and illustrate it. Edit preserves item identity and price history. Regeneration keeps existing artwork visible until a replacement has been uploaded successfully.

### Folders and public sharing
Create and rename folders through small dialogs. Share dialog starts at Private. Enable link creates an unguessable token and offers Copy link, Revoke link and Rotate link. Link grants read-only access to that folder's published fields and images, never sibling folders or account data. Returning a folder to private invalidates public access immediately. Public page uses the same scrapbook design, folder title and read-only item dialogs; it omits private navigation and account controls. Public data includes title, image, source URL, price observations and a separate optional public description. Owner notes remain private. Empty public folders say Nothing saved here yet.

### Account and connection
Registration and login support email/password or passkeys. Profile contains display name, email, preferred currency, password management, registered passkeys, sessions and AI connections. Account recovery needs a concrete deployment policy before implementation; proposed recovery codes and enrollment of a second passkey. Do not promise email delivery until SMTP is configured. Passkeys require HTTPS in production and stable relying-party domain. Default currency is a preference, not conversion.

Connect AI shows the MCP endpoint, connection instructions, permission choices, and revocation. Proposed version-one authentication uses revocable scoped tokens for clients supporting bearer-token setup; document compatibility per target client. If the target client requires OAuth discovery/authorization, use the implemented authorization-code/PKCE flow described in docs/MCP.md. Token secrets are shown once and stored hashed. Profile never exposes secrets again.

## Design system
Canvas #F4F0E8; paper #FFFCF6; ink #25231F; muted text #68635B; border #C9C2B7. These are warm neutrals only. Serif heading and title stack: Georgia, Times New Roman, serif. Controls and metadata: system-ui, sans-serif. Heading 44px desktop / 32px mobile; item title 18–22px; body 16px; controls 14px. Thin rules, restrained paper shadows, no gradients or decorative interface illustrations. Focus uses a clearly visible dark outline. Controls always have words; essential actions never require hover.

Stamp treatment uses a perforated neutral paper border. Sticker treatment uses a contour-following pale edge. 3D treatment uses transparent artwork with a soft contact shadow. All styles retain real product identity; artistic representation is not a guaranteed accurate product photograph. Price remains real selectable text on a neutral paper label, independent of generated image pixels. No fake postal marks, decorative logos or icons in interface chrome.

## AI image contract
The connected AI generates the selected presentation with a transparent background, centered isolated subject, generous edge clearance and no price or text baked into artwork. Recommended square source, 1024px or larger. It uploads image bytes through a bounded authenticated upload flow and attaches the resulting asset ID through MCP. Server validates MIME, dimensions and size and stores assets locally. The server does not retrieve arbitrary image URLs. Initial formats: PNG and WebP; no active SVG uploads. User can switch style while retaining old art until replacement arrives. The mockup uses neutral illustrative placeholders, not final generated product artwork.

## MCP contract proposal
Use the official MCP SDK, version pinned during implementation, with Streamable HTTP at /mcp. All tools authorize against the connected user and optional folder scope on every call. Public sharing never grants MCP write access.

Tools: list_folders, create_folder, update_folder; list_items, get_item, create_item, update_item, move_item, delete_item; prepare_asset_upload, attach_item_asset; record_price_observation, list_price_observations. Folder deletion is a separate explicit operation with non-empty-folder handling. Sharing changes remain web-only in version one. Tool schemas use explicit IDs, bounded pagination, structured errors and strict input validation. Item updates carry a revision to reject stale writes. Create and observation tools accept idempotency keys to avoid duplicate writes after retries. Deletes are soft deletes with owner recovery in version one.

A price observation records item, amount in integer currency minor units, ISO currency, merchant, source URL, observed_at and recorded_at, plus optional deal description, expiry and shipping notes. AI is responsible for research; display prices as recorded observations with their age and source. Mark expired deals as expired. Only compare equivalent currencies; avoid claiming an all-time low or total checkout cost without evidence. Latest display price is the latest valid observation by observed_at, with an explicit owner override if needed. No observations means price unknown.

## Data and deployment
Tables: users, password_credentials, passkeys, sessions, recovery_codes, folders, share_links, items, assets, price_observations, mcp_tokens, mutation_log. Every owned record carries user_id; relationships enforce matching ownership. Items store folder_id, title, source_url, private_notes, public_description, presentation, size, asset_id, revision, timestamps and deleted_at. Assets use opaque IDs with authenticated or authorized public serving. Public links store hashed tokens. Asset access rechecks folder visibility; revoking a link must not leave permanently public asset URLs.

SvelteKit adapter-node serves web routes and MCP over the same origin. SQLite enables foreign keys, WAL and bounded busy retries; use short transactions. One application replica with a durable Docker volume mounted at /data holds database and artwork. Reverse proxy terminates TLS. Compose configuration supplies origin, RP ID, session settings and volume paths. No managed database or cloud bucket required. Document consistent SQLite backups plus assets, restore validation and migrations before implementation is complete. Do not copy only the live database file while ignoring WAL.

## Accessibility and states
Keyboard order follows the logical item order, independent of visual rotation. Images have descriptive alt text; price changes include words, never color alone. Touch controls remain visible and comfortably sized. Show empty-folder, initial empty account, unknown price, pending artwork, failed upload, stale MCP revision, unavailable source, revoked public link and session-expiry states. Preserve form input on recoverable failures. Provide ordinary readable image/title fallback if artwork is missing. Support 200% zoom and reduced motion.

## Acceptance criteria for later implementation
1. Password and passkey users can register, sign in, sign out and manage credentials.
2. Cross-user reads and writes fail for web, MCP and asset endpoints.
3. Users can create folders and items, choose any of three styles and upload/replace transparent artwork.
4. Public links work without an account, remain read-only and stop working after revocation, including asset access.
5. Authenticated MCP can list, add and edit authorized data, record price findings and reject stale/duplicate writes appropriately.
6. Dialog hero transitions work with keyboard, narrow screens and reduced motion.
7. Recorded prices show currency, date and source; app makes no autonomous research or image generation requests.
8. Docker restart preserves data and assets; backup restore reproduces both.

## Remaining implementation decisions
Choose the first MCP client to support and its authentication requirements; settle recovery/SMTP policy; decide whether free dragging or nested folders is desirable after testing the automatic composition. These do not block review of the visual direction.
