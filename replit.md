# AI Gateway Platform

## Overview

SaaS AI Gateway — pnpm workspace monorepo (TypeScript).

Proxies Google Vertex AI (Gemini 2.5 + Gemini 3.x / Imagen / Veo) and **23 live models** from partner providers (Grok, DeepSeek, Kimi, MiniMax, Gemma) for developer clients. Developers receive API keys from the platform; the platform authenticates, rate-limits, bills per token at a **1.1× markup** (10% on official Vertex AI prices), and routes requests to the appropriate Vertex AI backend.

Includes a full admin dashboard and a developer self-service portal, with Arabic + English i18n.

---

## Artifacts

| Artifact | Preview path | Purpose |
|---|---|---|
| `artifacts/api-server` | `/api`, `/v1` | Express 5 API: admin routes, portal routes, v1 proxy |
| `artifacts/dashboard` | `/` | React + Vite: admin panel + developer portal + landing page |

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Package manager | pnpm workspaces |
| Language | TypeScript 5.9 |
| API framework | Express 5 |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Validation | Zod v4 + drizzle-zod |
| API codegen | Orval (OpenAPI → `lib/api-client-react`) |
| Build | esbuild (api-server bundle), Vite (dashboard) |
| Frontend | React 19, TanStack Query v5, shadcn/ui, recharts |
| Auth | JWT (localStorage) + scrypt N=16384 password hashing |
| Encryption | AES-256-GCM (API keys stored) + HMAC-SHA256 (lookup + webhooks) |
| File uploads | multer (memory storage, 20MB limit, images only) |
| Logging | pino + pino-http |
| Testing | Vitest — 193 tests across 17 test files (billing, crypto, cookie-auth, v1 routes, admin, portal) — pool: forks, ~22s |
| i18n | react-i18next (English + Arabic RTL) |

---

## DB Schema (12 tables)

| Table | Purpose |
|---|---|
| `users` | Auth, roles, credit balance, email verification, password reset, low-credit email timestamp |
| `api_keys` | Keys linked to users/plans; HMAC hash + AES-256-GCM encrypted value |
| `plans` | Tiers: monthly credits, RPM, allowed model list, price |
| `usage_logs` | Immutable request records (tokens, cost, model, status) |
| `providers` | Google Cloud projects + encrypted service-account JSON |
| `model_costs` | Per-model pricing (DB override for hardcoded fallback, 5-min cache) |
| `rate_limit_buckets` | Token Bucket per user (DB-backed) |
| `ip_rate_limits` | IP rate limiter for auth endpoints |
| `audit_logs` | Admin action audit trail with IP and timestamp |
| `promo_codes` | Redeemable codes (fixed amount or percentage, usage limit) |
| `violation_logs` | Content guardrail violation evidence with auto-suspend logic |
| `webhooks` | User webhook endpoints with HMAC-SHA256 secret, event filter, lastTriggeredAt |

---

## Live Models (23)

### Google — Gemini 2.5
- `gemini-2.5-pro` ($1.25/$10.00 per 1M in/out)
- `gemini-2.5-flash` ($0.30/$2.50)
- `gemini-2.5-flash-lite` ($0.10/$0.40)

### Google — Gemini 3.1
- `gemini-3.1-pro-preview` ($2.00/$12.00)
- `gemini-3.1-flash-lite-preview` ($0.25/$1.50)
- `gemini-3.1-flash-image-preview` ($0.50/$3.00)

### Google — Gemini 3.0
- `gemini-3.0-pro-preview` ($2.00/$12.00)
- `gemini-3.0-flash-preview` ($0.50/$3.00)
- `gemini-3.0-pro-image-preview` ($2.00/$12.00)

### Google — Imagen (image generation)
- `imagen-4.0-generate-001` ($0.04/img) · `imagen-4.0-ultra-generate-001` ($0.06/img)
- `imagen-3.0-generate-002` ($0.04/img) · `imagen-3.0-fast-generate-001` ($0.02/img)

### Google — Veo (video generation)
- `veo-3.1-generate-001` ($0.40/s) · `veo-3.1-fast-generate-001` ($0.12/s)
- `veo-3.0-generate-001` ($0.40/s) · `veo-2.0-generate-001` ($0.50/s)

### Partners (6 live)
- xAI: `grok-4.20`, `grok-4.1-thinking`
- DeepSeek: `deepseek-v3.2`
- Google MaaS: `gemma-4-26b`
- Kimi: `kimi-k2`
- MiniMax: `minimax-m2`

### Coming Soon (19 — comingSoon: true in models.ts, no API routing)
Grok 4.1 Fast · Mistral (7) · DeepSeek R1 (4) · GLM-5/5.1 · Llama 4/3.3 · GPT-OSS 120B · Qwen3 235B

---

## API Endpoints

### V1 — Developer API (Bearer: `sk-...` API key)
| Method | Path | Description |
|---|---|---|
| POST | `/v1/chat` | Chat (our format, text + image parts) |
| POST | `/v1/chat/completions` | Chat (OpenAI-compatible format) |
| POST | `/v1/responses` | Responses API |
| POST | `/v1/generate` | Image generation (Imagen) |
| POST | `/v1/video` | Video generation (Veo), returns job ID |
| GET | `/v1/video/:jobId` | Poll video job status |
| GET | `/v1/models` | List available models |
| POST | `/v1/files` | Upload image for multimodal chat (returns base64 + mimeType) |

### Portal — Developer Self-Service (Bearer: JWT)
| Method | Path | Description |
|---|---|---|
| GET/PUT | `/portal/me` | Profile |
| GET/POST/DELETE | `/portal/api-keys` | API key management |
| GET | `/portal/usage` | Usage logs + daily stats + per-model breakdown |
| GET | `/portal/plans` | Available plans |
| POST | `/portal/promo-codes/redeem` | Redeem promo code |
| GET/POST/PUT/DELETE | `/portal/webhooks` | Webhook CRUD |
| POST | `/portal/webhooks/:id/test` | Send test webhook event |

### Admin (Bearer: JWT, role=admin)
| Method | Path | Description |
|---|---|---|
| GET/POST/PUT/DELETE | `/admin/users` | User management |
| GET/POST/PUT/DELETE | `/admin/plans` | Plan management |
| GET/POST/PUT/DELETE | `/admin/providers` | Vertex AI provider config |
| GET/POST/PUT/DELETE | `/admin/model-costs` | Per-model pricing override |
| GET | `/admin/analytics/stats` | Platform-wide stats |
| GET | `/admin/analytics/timeseries` | Chart data with model breakdown |
| GET | `/admin/analytics/usage` | Filtered usage log |
| GET | `/admin/analytics/user-summary` | Per-user breakdown |
| GET | `/admin/audit-log` | Admin action log |
| GET/POST/PUT/DELETE | `/admin/api-keys` | API key admin |
| GET/POST/PUT/DELETE | `/admin/promo-codes` | Promo code management |

---

## Key Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/billing.ts` | MODEL_COSTS map, MARKUP_FACTOR=1.1, calculateChatCost/Image/Video |
| `artifacts/api-server/src/lib/guardrails.ts` | 4-layer content safety: Vertex + system prompt + keyword blacklist + auto-suspend |
| `artifacts/api-server/src/lib/rateLimit.ts` | Token bucket rate limiting per user |
| `artifacts/api-server/src/lib/vertexai.ts` | Re-export barrel — imports from 5 focused sub-modules (see below) |
| `artifacts/api-server/src/lib/vertexai-types.ts` | Shared interfaces, type aliases, model alias tables, provider detection utils |
| `artifacts/api-server/src/lib/vertexai-provider.ts` | Provider resolution (DB/env), VertexAI client builder, Google access token helper |
| `artifacts/api-server/src/lib/vertexai-gemini.ts` | Gemini SDK chat (streaming + non-streaming); global-endpoint REST path for Gemini 3.x |
| `artifacts/api-server/src/lib/vertexai-compat.ts` | OpenAI-compatible endpoint chat (Grok, DeepSeek, Kimi, MiniMax, Gemma MaaS) |
| `artifacts/api-server/src/lib/vertexai-imagen.ts` | Imagen image generation via Vertex AI predict API |
| `artifacts/api-server/src/lib/vertexai-veo.ts` | Veo video generation + async job status polling |
| `artifacts/api-server/src/lib/chatUtils.ts` | stripThinkTags, ThinkTagFilter, deductAndLog, estimateChatCost |
| `artifacts/api-server/src/lib/webhookDispatcher.ts` | HMAC-signed webhook dispatch (fire-and-forget) |
| `artifacts/api-server/src/routes/v1/chat.ts` | Chat route — multimodal, streaming, guardrails, billing, webhook dispatch |
| `artifacts/api-server/src/routes/v1/files.ts` | Image upload endpoint (multer, 20MB, returns base64) |
| `artifacts/api-server/src/routes/portal/webhooks.ts` | Webhook CRUD + test endpoint |
| `artifacts/api-server/src/routes/portal/usage.ts` | Usage stats + daily chart + per-model breakdown |
| `artifacts/api-server/src/routes/index.ts` | Route registration — admin + portal + v1 |
| `artifacts/dashboard/src/lib/models.ts` | MODELS[] array with ModelDef (id, provider, pricing, comingSoon?) |
| `artifacts/dashboard/src/pages/portal/Usage.tsx` | Usage page: daily chart + per-model bar chart + model filter |
| `artifacts/dashboard/src/pages/portal/Webhooks.tsx` | Webhook management page (create/toggle/delete/test + HMAC docs) |
| `artifacts/dashboard/src/pages/Landing.tsx` | Public landing page — bilingual, dynamic GATEWAY_BASE |
| `artifacts/dashboard/src/pages/portal/Docs.tsx` | Developer docs — model table, code samples (23 models) |
| `artifacts/dashboard/src/pages/admin/Plans.tsx` | Plan management + ModelPicker (comingSoon = disabled) |
| `artifacts/dashboard/src/pages/admin/Pricing.tsx` | Model cost management (1.1× markup display) |
| `lib/db/src/schema/webhooks.ts` | Webhooks table schema |
| `lib/db/src/schema/` | All 12 Drizzle schema files |
| `lib/api-zod/src/generated/api.ts` | Zod schemas — includes multimodal ChatContentPart |

---

## Architecture Notes

- **Billing**: `MODEL_COSTS` in billing.ts is the hardcoded fallback. DB table `model_costs` overrides these. A 5-minute in-memory cache reduces DB reads. MARKUP_FACTOR = 1.1 applied at billing time.
- **Model routing**: Only 23 live models have Vertex AI routing in vertexai.ts. The 19 `comingSoon` models exist in models.ts (dashboard display) but have no API routes — requests to them return 404.
- **Multimodal**: `ChatMessage.content` accepts `string | ContentPart[]`. ContentPart = `{ type:"text", text }` or `{ type:"image", mimeType, base64 }`. Gemini REST and SDK paths both handle image inlineData. OpenAI-compat models receive text-only (images silently stripped).
- **Webhooks**: HMAC-SHA256 signed. Signature in `X-Gateway-Signature: sha256=<hex>`. Events: `usage.success`, `usage.error`, `usage.rejected`, `low_balance`. Empty `events[]` = subscribe to all. Fire-and-forget (8s timeout per request).
- **Guardrails**: 4-layer defense. Layer 3 keyword blacklist covers Arabic and English. Layer 4 auto-suspends after 3 violations and logs evidence to `violation_logs`.
- **Auth separation**: Admin uses `/api/admin/auth/login`, portal uses `/api/portal/auth/login`. Both issue JWT stored in localStorage.
- **TypeScript**: `noImplicitAny` disabled in dashboard tsconfig (complex generated types). API server is strict.
- **Logging**: All server-side logging uses `pino` (via `src/lib/logger.ts`). No `console.log/warn/error` in production code paths.
- **Test mocking pattern**: dbMock uses `then: vi.fn(resolve => resolve([]))` to make the mock object thenable — enabling `await db.select().from().where()` chains without `.limit()`. `limit` uses `mockReturnThis()` so chains like `.limit().offset()` work; `offset` uses `mockResolvedValue([])` as the terminal.
- **lib rebuilding**: After schema changes, clear `tsbuildinfo` files in lib/db, lib/api-zod, lib/api-client-react before running typecheck.

---

## Environment Variables (Replit Secrets)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES-256-GCM key for API key storage |
| `ADMIN_EMAIL` | Initial admin account email |
| `ADMIN_PASSWORD` | Initial admin account password |
| `SMTP_PASS` | Gmail SMTP password for email verification |

Shared env (in .replit userenv): `SCRYPT_N=16384`, `SMTP_HOST`, `SMTP_USER`, `SMTP_FROM`, `SMTP_PORT`, `APP_BASE_URL`

---

## Run Commands

```bash
# Development
pnpm --filter @workspace/api-server run dev   # API Server (port from PORT env)
pnpm --filter @workspace/dashboard run dev    # Dashboard (Vite dev server)

# Production build
pnpm run build                                # Typecheck + build all artifacts

# Production start
PORT=8081 pnpm --filter @workspace/api-server run start
pnpm --filter @workspace/dashboard run serve

# Database
cd lib/db && pnpm push                        # Apply schema changes (dev only)
cd lib/db && pnpm push-force                  # Force apply (skip confirmations)
cd lib/db && pnpm generate                    # Generate SQL migration file
cd lib/db && pnpm migrate                     # Apply migrations (production-safe)

# Library builds (must run after schema changes)
pnpm --filter @workspace/db build             # Generates lib/db/dist/*.d.ts
pnpm --filter @workspace/api-zod build        # Generates lib/api-zod/dist/*.d.ts

# Tests
pnpm --filter @workspace/api-server test      # 193 tests across 17 test files (~22s)

# Typecheck
pnpm -r typecheck                             # All 8 packages (0 errors)
```

---

## Payment / Credit Top-up

Stripe integration was dismissed by the user. If credit top-up (pay-as-you-go) is needed in the future:
- Option A: Re-authorize the Replit Stripe connector (`connector:ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y`) via the Integrations panel
- Option B: Provide `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` as Replit Secrets and implement top-up manually

Do **not** hardcode any payment credentials. Always store them as Replit Secrets.

---

## Recent Changes (Apr 2026)

### Session 7 — VPS Deployment Hardening + Production SSL Fix

- **Production SSL fix** (`lib/db/src/index.ts`): Changed from `rejectUnauthorized: true` (hard fail) to detecting SSL from `DATABASE_URL` — uses `rejectUnauthorized: false` when `sslmode=` or `ssl=` appears in the URL. Fixes 503/500 errors on Replit-hosted production where system CA store lacks Neon's cert.
- **Graceful shutdown** (`artifacts/api-server/src/index.ts`): Added `SIGTERM`/`SIGINT` handlers that call `server.close()` → `pool.end()` → `process.exit(0)`. 30-second force-kill timeout prevents zombie processes on VPS restarts and zero-downtime rolling deploys.
- **Auto-migration runner** (`artifacts/api-server/src/migrate.ts`): New standalone entrypoint built to `dist/migrate.mjs`. Reads migrations from `MIGRATIONS_DIR` env var (Docker: `/app/migrations`, PM2: `lib/db/migrations`). Resolves the "fresh VPS empty DB" problem — tables are always created before the API starts.
- **build.mjs updated**: Added `src/migrate.ts` to esbuild entry points; `dist/migrate.mjs` (425 KB) is now emitted alongside `dist/index.mjs`.
- **docker/Dockerfile.api updated**: Copies `lib/db/migrations/` to `/app/migrations/` in the runtime image; CMD changed to run migrations then start API (`sh -c "node migrate.mjs && node index.mjs"`). Added `pnpm-lock.yaml` copy for reproducible installs.
- **docker-compose.yml updated**: Added `MIGRATIONS_DIR`, `api_logs` volume, GCP key volume comment, fixed health check path (`/healthz`).
- **ecosystem.config.cjs updated**: Added `pre_start` hook to run `migrate.mjs` before PM2 starts the API; added `env_file`, `min_uptime`, `merge_logs`.
- **.env.example updated**: Added `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`, `REDIS_URL`, `LOG_LEVEL`, `SENTRY_DSN`, `MIGRATIONS_DIR` with full documentation.
- **docker/nginx-ssl.conf** (new): Full HTTPS Nginx template — TLS 1.2/1.3 only, strong ciphers, OCSP stapling, HTTP→HTTPS redirect, `proxy_buffering off` for SSE streaming, 1-year cache headers for static assets.
- **DEPLOY.md updated**: Added Google Cloud/Vertex AI setup section (SA creation, IAM role, key JSON), migration docs, fixed health check URL (`/api/health` → `/api/healthz`), complete env var reference table.

### Session 6 — Bug Fixes, Bundle Optimization & TypeScript Cleanup

- **Issue 6 — DB Migrations**: Added `generate` + `migrate` scripts to `lib/db/package.json`; created initial migration snapshot (`migrations/0000_cheerful_moira_mactaggert.sql`) capturing all 13 tables. `push` remains available for dev, `migrate` is production-safe with rollback capability.
- **Issue 7 — Bundle size**: api-server bundle reduced from **2.0 MB → 766 KB** (62%) by adding `minifyWhitespace: true`, `minifySyntax: true` to esbuild, and externalizing 5 packages that were being bundled unnecessarily (`helmet`, `express-rate-limit`, `multer`, `jsonwebtoken`, `ioredis`).
- **Issue 8 — Test speed**: vitest switched to `pool: 'forks'` (instead of threads); import time reduced from 10.2s → 7.0s; wall time 24.6s → 22.7s. All 193 tests pass.
- **Issue 9 — /v1/models auth**: Added `requireApiKey` middleware to `GET /v1/models` — now requires valid API key (HTTP 401 if missing/invalid).
- **Admin seed bug**: `seed.ts` now sets `emailVerified: true` for both new admin account creation and promotion of existing user to admin role.
- **TypeScript errors fixed (0 errors)**: Root cause was missing `dist/` declarations in `lib/db` and `lib/api-zod`. Fixed by:
  - Adding `"build": "tsc -b"` to both packages' `package.json`
  - Running clean builds to generate all `.d.ts` files (including previously missing `plans.d.ts`, `providers.d.ts`)
  - Exporting `DbTransaction` type from `@workspace/db` for use in route files
  - All 34× TS7006 (implicit any) and all TS6305 (missing declarations) errors resolved

### Session 5 — vertexai.ts Split + V1 Route Tests (133 tests)

- **vertexai.ts modularised**: 708-line file split into 5 focused modules — `vertexai-types.ts` (interfaces + alias tables), `vertexai-provider.ts` (auth + VertexAI client), `vertexai-gemini.ts` (Gemini SDK + REST global endpoint), `vertexai-compat.ts` (OpenAI-compat MaaS), `vertexai-imagen.ts`, `vertexai-veo.ts`. `vertexai.ts` is now a re-export barrel preserving the public API.
- **V1 route tests added**: `v1-chat.test.ts` (17 tests), `v1-generate.test.ts`, `v1-video.test.ts` covering guardrail blocking, rate-limit 429, billing deduction, credit-insufficient 402, streaming SSE, and model-type gating.
- **ThinkTagFilter mock fix**: Changed from `vi.fn(() => ({...}))` to a real `class` in mock factory so `vi.resetAllMocks()` doesn't lose the constructor implementation.
- **Video status route fix**: Tests updated to expect HTTP 202 (Accepted) from `POST /v1/video` and use the correct `:jobId/status` path param.
- **verify-backup.sh**: New script at `artifacts/api-server/scripts/verify-backup.sh` — checks /healthz, DB connectivity, key table row counts, and required env vars.
- **133 tests passing** across 12 test files (up from 94).

### Session 4 — Security Hardening + 63-test Suite
- **GCM auth-tag length check**: `crypto.ts` `tryDecrypt` now validates IV=12B + tag=16B before `setAuthTag`; also sets `setAuthTagLength(16)` to prevent truncated-tag attacks
- **TLS verification**: `lib/db/src/index.ts` changed `rejectUnauthorized: false` → `true` in production (Neon supports valid CA certs)
- **HTML injection in emails**: Added `escapeHtml()` in `email.ts`; all three `build*Email` functions now escape user-provided `name` before templating
- **Helmet security headers**: Added `helmet` middleware in `app.ts` (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, etc.)
- **Endpoint model gating**: `v1/chat.ts` blocks `imagen-*` and `veo-*` (400); `v1/generate.ts` only allows `imagen-*`; `v1/video.ts` only allows `veo-*` — prevents 0-cost billing bypass
- **63-test integration suite**: Route tests for all admin, portal, and v1 routes; fixed `vi.resetAllMocks()` + thenable dbMock patterns
- **Admin rate-limit IPv6 fix**: `adminRateLimit.ts` uses `ipKeyGenerator` from `express-rate-limit` (eliminates ERR_ERL_KEY_GEN_IPV6)

### Session 3 — Webhooks + Multimodal + Per-Model Dashboard
- **Webhooks system**: New `webhooks` DB table (12th table). CRUD routes at `/portal/webhooks`. HMAC-SHA256 signed dispatch via `webhookDispatcher.ts`. Fires after every successful `/v1/chat` request. Portal page `Webhooks.tsx` with create/toggle/delete/test + signature verification code sample.
- **Multimodal chat**: `ChatMessage.content` now `string | ContentPart[]`. `TextPart` + `ImagePart` (mimeType + base64). `toGeminiContents()` and `msgToParts()` handle image inlineData for both Vertex REST and SDK paths. New `POST /v1/files` endpoint (multer, 20MB, JPEG/PNG/GIF/WebP/HEIC).
- **Per-model usage dashboard**: `/portal/usage` now returns `byModel[]` breakdown. `Usage.tsx` shows interactive bar chart per model — click to filter request log. Model cards with token/cost stats.
- **ChatCompletionBody schema**: Extended to accept `content: string | ContentPart[]` via zod discriminated union.

### Session 2 — Model Catalog + Pricing Corrections
- Added `comingSoon?: boolean` to ModelDef interface in models.ts
- Marked 19 partner models as `comingSoon: true` (no API routing)
- Plans.tsx: comingSoon models show "Soon" badge, disabled in ModelPicker
- Billing MARKUP_FACTOR corrected to 1.1 (was 1.3)
- All "1.3×" references updated to "1.1×" across Pricing.tsx, i18n, tests
- Docs.tsx: Added Gemini 2.5 section (3 models) — now shows all 23 live models
- Landing.tsx: CODE_SAMPLES now use `window.location.origin` (GATEWAY_BASE) dynamically
- 25/25 tests passing, TypeScript clean across all packages
