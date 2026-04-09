# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start local Wrangler dev server (port 8787)
npm start                # Alias for dev

# Testing
npm test                 # Run all tests with Vitest
cd api && vitest run test/index.spec.ts  # Run a single test file

# Deployment
npm run deploy           # Deploy both Worker and Pages
npm run deploy:worker    # Deploy API Worker only
npm run deploy:pages     # Build and deploy frontend Pages only

# Type generation
npm run cf-typegen       # Generate Cloudflare binding types (worker-configuration.d.ts)

# Database
# Local:  wrangler d1 execute joel-db --local --file=./schema.sql
# Remote: wrangler d1 execute joel-db --file=./schema.sql
```

All npm scripts run from the monorepo root (`/joel`). The API Worker source is in `api/`, the React frontend is in `web/`.

## Architecture

This is a **Cloudflare Workers** application (TypeScript). No routing framework is used — all routes are hand-matched in a single `fetch` handler in `api/src/index.ts`.

### Cloudflare Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 (SQLite) | User data, OAuth accounts, module permissions |
| `ASSETS` | R2 Bucket | User-uploaded images (avatars, puzzler) |
| `USER_SESSION` | KV Namespace | Session data (last_logout_at, access tokens) |

### Env secrets (set via `wrangler secret put`)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_RSA_PRIVATE_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `BASE_URL`, `FRONTEND_URL`, `R2_PUBLIC_URL`

### Key Modules

- **`src/index.ts`** — Main entry. Contains all route matching and ~30 handler functions. This is the single large file where routes and handlers live together.
- **`src/auth/`** — Authentication: Google OAuth (`google.ts`), JWT RS256 signing/verification (`jwt-rs256.ts`), session cookies (`session.ts`), KV session store (`session-kv.ts`), password hashing via PBKDF2 (`password.ts`).
- **`src/db/schema.ts`** — All database query functions and table schemas (users, oauth_accounts, user_module_permissions). No ORM — raw D1 SQL.
- **`src/modules.ts`** — Module permission definitions. Modules requiring explicit grant: `favor`, `gd`, `discover`, `pih`. Modules open to all: `profile`, `mini-games`. Admin-only: `admin`.
- **`src/admin/`** — Admin authorization check (`auth.ts`) and Cloudflare Analytics API integration (`analytics.ts`).

### Auth Flow

1. Google OAuth → `exchangeCodeForToken` → `findOrCreateUserByEmail` → `generateJWT` (RS256) + session cookie
2. API calls authenticate via `Authorization: Bearer <JWT>` or session cookie
3. Admin endpoints require JWT only (no session cookie), verified against hardcoded admin email
4. Cross-domain auth: `GET /auth?redirect=<url>` passes JWT to sibling domains (`*.scalarize.org`, `*.scalarize.cn`) via `/.well-known/jwks.json` public key endpoint

### Response Patterns

- API responses: `jsonWithCors(request, env, data, status)` — handles CORS headers automatically
- CORS allows: `*.scalarize.org`, `*.scalarize.cn`, `localhost:*`
- Errors: `{ error: string, message: string }` with appropriate HTTP status
- CORS preflight: all `/api/*` OPTIONS requests handled by `handleApiOptions()`

### Testing

Uses `@cloudflare/vitest-pool-workers` which provides a Workers-like environment. Config references `wrangler.jsonc` for bindings. Tests are in `api/test/`.

## Conventions

- All routes are defined as `if (path === '...' && request.method === '...')` blocks in the main `fetch` handler — add new routes in the same pattern before the 404 fallback.
- Database IDs use `crypto.randomUUID()`.
- Timestamps stored as ISO strings via `new Date().toISOString()`.
- The `PERM_VERSION` env var controls JWT permission cache invalidation — increment it when permission logic changes.
