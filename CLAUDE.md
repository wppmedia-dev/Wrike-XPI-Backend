# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — backend dev server (nodemon + babel-node on `src/index.js`, 4 GB heap). Does **not** build or watch the frontend.
- `cd frontend && npm run dev` — Vite dev server on :5174 for the React UI with HMR. It proxies `/api`, `/docs`, `/oauth`, `/.well-known`, `/environments`, etc. to the backend at `localhost:4000`, so run the backend with `PORT=4000`. A new backend-only route must be added to the proxy list in `frontend/vite.config.ts` or it 404s in dev.
- `npm run build` — `rm -rf dist`, build the frontend (`frontend/` → `public/app/`), Babel-transpile `src/` → `dist/`, then `scripts/gen-version.cjs` writes `dist/version.json` (git commit/branch/build time, served at `/version`). `rm -rf` means run it from a POSIX-ish shell on Windows.
- `npm start` — build, then `node dist`. Deployment is git-clone + `npm run build` on the host.
- `npm run migrate` / `npm run seed` — Sequelize CLI, wired via `.sequelizerc` (config `config/db.js`, `models/`, `migrations/`, `seeders/`).
- `npm run lint` — `eslint`, but no ESLint config is checked in, so it currently has nothing to apply.
- Tests: there is no test runner. The single test is `node test/environmentAccess.test.js` (stubbed, needs no DB/Redis/Wrike). It `require`s `@babel/register`, which is not in `package.json` — install it first if missing.

Everything needs `.env` populated. Beyond the DB/JWT/Wrike/Azure basics, code also reads `WRIKE_ENDPOINT`, `WRIKE_DATAHUB_ENDPOINT`, `WRIKE_MCP_URL`, `ENCRYPTION_MASTER_KEY`, `SESSION_SECRET`, `REDIS_*`, `RATE_LIMIT*`, `TRUST_PROXY`, `ACTIVITY_LOG_RETENTION_DAYS`, `ADMIN_SETUP_KEY`, `DATAHUB_*`, and SendGrid mail vars (`grep process.env` for the full set). Redis can be run via Docker per `redis-setup.md`.

## Architecture

Fastify (ESM via Babel) backend that proxies the Wrike API for the XPI platform, plus an MCP server, an OAuth provider for MCP clients, and admin/portal web consoles.

### Entry point and route mounting (`src/index.js`)

One async IIFE: auto-loads `src/plugins/*` (except `mcp.js`, which is registered per-route group), registers route groups, runs startup syncs, then listens on `PORT`.

- `PublicRouters` (`src/routes/index.js`) at `/api/v1` — `tokens` (`/wrikexpi/token`), `admin` and `portal` JSON APIs, the MCP plugin at `/wrikexpi/mcp[/:environmentId]`, `/app-config`, `/datahub/customfield`.
- `PrivateRouters` at `/api/v1` — `onRequest` runs `ValidateToken`, then mounts `campaign`, `channel`, `task`, `master` (`/wrikexpi/v1.0`), `amoeba` under `/wrikexpi/...`, plus a few inline REST routes (campaign→channels, channel/campaign→tasks).
- `adminRoute` at `/admin` and `portalRoute` at `/portal` — serve the React HTML entries (`reply.sendFile("admin-login.html", .../public/app)`); the `/api/v1/admin|portal` routes are their data APIs.
- `oauth/wellKnown` (root-level discovery per RFC 8414/9728) and `oauth` at `/oauth` — OAuth for MCP clients (`/oauth/register`, `/authorize`, `/token`); `client_id` is a signed JWT embedding allowed `redirect_uris`.
- `docs` / `mcpDocs` — server-rendered documentation pages (`/docs/mcp`, `/docs/api`).
- Unauthenticated utilities in `index.js`: `/health`, `/version`, `/environments`, `/get-redirect-url`, `/` (Wrike OAuth launcher; `autoRedirect=true` 302s server-side), and `GET /api/v1/sync-secrets` / `/api/v1/sync-db-credentials` to re-hydrate caches.

Startup also runs `syncSecrets` (Azure Key Vault → `process.env`), `syncWrikeCredentialsFromDB()`, and `startRetentionSweep()` (activity-log purge every 6 h).

### Route module convention

`src/routes/<name>/` = `handlers/` (one async function per operation, signature `(wrikeToken, params, fastify, environmentName)`), `schema/` (Fastify route schema), optional `utils/`, and `index.js` wiring them to verbs. Handlers return `{ statusCode, message, data, nextPageToken }` or throw an error carrying `statusCode`; the wrapper sends `{ success, message, data, nextPageToken }` or `{ success: false, details, message }`. Mirror this layout; keep business logic out of `index.js`. DB access goes through `src/controllers/` (`Tokens`, `WrikeCredentials`, `EnvironmentAccess`, `ActivityLog`, ...), not models directly.

### Frontend (`frontend/`)

React 19 + Vite multi-page app (one HTML entry + `main-*.tsx` per page: admin login/TOTP/dashboard, portal login/change-password/dashboard/home, root login). Builds into `public/app/` (gitignored), served under `/app/` by `src/plugins/appStatic.js`. Pages fetch their data client-side (`frontend/src/lib/*Api.ts`) rather than having it injected into HTML. Adding a page means: a new HTML entry + `main-*.tsx`, an entry in `rollupOptions.input` and `DEV_ROUTES` in `vite.config.ts`, and a backend route that `sendFile`s it.

### Authentication and encryption model

`src/middlewares/authentication.js` (`ValidateToken`) protects all private routes, with two modes:

- **Basic** — username/password against `user_tokens`; Argon2id verification, and the same password derives a KEK that unwraps the per-token DEK (`wrapped_dek`).
- **Bearer JWE** — JWT signed with `JWT_SECRET`. Current payload is `{ t: tokenId, d: base64 DEK }`; legacy tokens use `tid` + an inner JWT `enc` — both are still accepted (180-day expiry).

With the DEK, `encrypted_access_token` is AES-GCM-decrypted (`src/utils/crypto.js`) and set as `req.wrikeToken`; `req.environmentName`, `req.envId`, `req.callerEmail`, `req.access` are also set. If the Wrike access token expires within 30 min it is refreshed via `getWrikeTokens` and both tokens re-encrypted with the same DEK. `resolveAuth` / `ResolveAuthFromJWT` / `ResolveAuthFromCredentials` expose the same logic to MCP and OAuth.

Admin/portal use `adminAuth.js` / `portalAuth.js` with Fastify sessions (stored via `connect-session-sequelize`); admin login also requires TOTP (`src/utils/totp.js`).

### Environment access gate

Immediately after token validation, `evaluateAccess` (`src/utils/environmentAccess.js`) checks the caller's email, email domain, or IP (`clientIp`, depends on `trustProxy`) against the environment's enabled allow-list rules (`environment_access_rules`, each scoped to the REST API, MCP, or both via `applies_to`). It is fail-closed, with caching in `environmentAccessCache.js` (in-process map → Redis → Postgres). Admin/portal writes that change rules or security switches must invalidate via `invalidateEnvironment`. Denied callers always get the generic `PUBLIC_DENIAL_MESSAGE` (403) — never leak the diagnostic `checks`/`message` to them.

### MCP (`src/plugins/mcp.js`, `src/mcp/`)

Streamable-HTTP MCP endpoint; a fresh server + transport is built per POST. Auth is the OAuth bearer on the HTTP header, resolved once per request and passed into tools (never a tool parameter). Two tool families are merged: native XPI tools (`src/mcp/tools/*`: campaign, channel, task, datahub, ids) and Wrike's hosted MCP tools proxied with a `wrike_` prefix (`wrikeMcpProxy.js`, uses `WRIKE_MCP_URL`, 8 s timeout, tool list cached in Redis). The agent-facing guidance for choosing between them lives in `MCP_INSTRUCTIONS` in `src/mcp/index.js`; update it when tools change.

### Activity log

`src/utils/activityLog.js` records one row per REST/MCP/token request (`api_activity_logs`) via fire-and-forget `log()` — never await it in a request path. Request/response bodies are captured through `src/utils/capture.js` (secrets redacted; responses stored only for non-200/201). Retention is `ACTIVITY_LOG_RETENTION_DAYS` (default 30). The same hooks (`onSend` capture + `onResponse` log) are duplicated in `routes/index.js`, `routes/tokens/index.js`, and `plugins/mcp.js` — new surfaces need them too.

### Wrike credentials cache

`src/utils/wrikeCredentials.js` holds an in-memory map of environment name → `{ id, clientId, clientSecret, accountId, datahub IDs, ... }` from `wrike_credentials`. Use `getCachedWrikeCredentials()` (all) or `getCachedVisibleWrikeCredentials()` (`is_visible` only, for user-facing dropdowns) rather than re-querying. Re-sync after admin CRUD on credentials (startup, `/sync-db-credentials`, or an explicit `syncWrikeCredentialsFromDB()`).

### Persistence and secrets

PostgreSQL via Sequelize; models in `models/` (auto-loaded by `models/index.js`), timestamp-prefixed migrations in `migrations/`. Redis (`src/utils/redis.js`) backs caches and the admin/portal cache inspector routes. Secrets come from `.env` (infrastructure) and Azure Key Vault (`XPI-API-ClientId`, `XPI-API-ClientSecret`, `XPI-API-Token`, hydrated into `process.env` at boot); per-environment Wrike client/account/datahub values live in Postgres, not the vault.
