# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root (`C:\java\applyr`) unless stated otherwise.

```bash
# Install all workspace dependencies
npm run setup

# Start both server and client (port 3090) with hot-reload
npm run dev

# Production build (client → dist, server → dist)
npm run build

# Run production server (serves API + built client SPA)
npm start

# Server only (from server/)
npm run dev -w server

# Client only (from client/)
npm run dev -w client
npm run build -w client   # tsc -b && vite build
```

Tests live in `tests/` and run with `npm test` (vitest, integration tests against the real SQLite DB). `npm run deadcode` checks for unused code (knip).

## Architecture

npm workspaces monorepo: `server/` (Express/TypeScript API) + `client/` (React/Vite SPA). In production, the server serves the built client from `client/dist/` as a SPA fallback.

### Server (`server/src/`)

- **`index.ts`** — boots Express, calls `initDb()`, starts listener
- **`app.ts`** — mounts all routers under `/api/*`, serves static files in prod
- **`config.ts`** — ports, data dir (`./data/` in dev, `~/.applyr/data/` in prod), output dir
- **`db/connection.ts`** — singleton `better-sqlite3` instance; call `getDb()` everywhere, `initDb()` once at startup
- **`db/migrations/001_initial.sql`** — single migration file defines all tables; `migrate.ts` runs it on startup
- **`lib/ai.ts`** — all three OpenAI streaming functions: `streamAnalysis`, `streamGeneration`, `streamRefinement`. Each uses SSE (`text/event-stream`), emitting `{ token }` chunks then a final `{ done, fullText, fitScore? }` event. AI credentials come from the `settings` table at call time (not env vars). `BEST_PRACTICES.md` from `resources/` is injected into the cover letter generation system prompt.
- **`lib/extractor.ts`** — scrapes job descriptions from URLs via cheerio/fetch
- **`lib/vault.ts` / `lib/fileStore.ts`** — document upload, storage in `data/vault/`, text extraction (PDF via pdf-parse, ODT via adm-zip + XML strip, plaintext/markdown direct)
- **`lib/outputWriter.ts`** — writes generated cover letters to `~/Documents/Applyr/<folder>/` on disk

**Route → function mapping:**
| Route | Purpose |
|---|---|
| `POST /api/extract` | Scrape job URL → company/role/description |
| `POST /api/analyze` | SSE stream: CV vs job fit analysis + score |
| `POST /api/generate` | SSE stream: cover letter generation |
| `POST /api/refine` | SSE stream: letter refinement from instruction |
| `GET/POST/PATCH/DELETE /api/jobs` | Application CRUD |
| `GET/POST/PATCH/DELETE /api/vault` | Document vault CRUD |
| `GET/POST/PATCH/DELETE /api/snippets` | Snippet library CRUD |
| `GET/PUT /api/settings` | Key/value settings store |
| `GET /api/analytics/*` | Summary, trends, company breakdowns |
| `POST /api/auth/*` | PIN set/remove/verify/lock |
| `GET /api/export/csv`, `GET/POST /api/transfer` | Export/import |

### Client (`client/src/`)

- **`api.ts`** — all fetch calls to the server; `streamRequest()` returns a raw `Response` for SSE consumption
- **`types.ts`** — shared TypeScript interfaces (`Application`, `VaultDocument`, `Snippet`, `Settings`, etc.)
- **`hooks/useStream.ts`** — consumes SSE streams from `streamRequest()`; exposes `{ text, loading, done, error, start, reset }`. Used for all three AI flows.
- **`contexts/ThemeContext.tsx`** — 9 named themes with full CSS custom property injection (`--theme-bg`, `--theme-surface`, etc.) + Tailwind `dark` class management. Theme persisted in `localStorage` as `applyr_theme_name`. Import `THEMES` array for the theme picker.
- **`contexts/AuthContext.tsx`** — PIN lock state; wraps the app, shows lock overlay
- **`contexts/SettingsContext.tsx`** — loads AI/style settings from the server on mount

**Page → route mapping:**
| Page | Route |
|---|---|
| `DashboardPage` | `/` |
| `NewApplicationPage` | `/apply` |
| `ApplicationsPage` | `/applications` |
| `ApplicationDetailPage` | `/applications/:id` |
| `AnalyticsPage` | `/analytics` |
| `SettingsPage` | `/settings` |
| `DonatePage` | `/donate` |

`SettingsPage` uses a `?tab=` query param (themes, ai, style, output, vault, snippets, data, security) — old routes `/vault`, `/snippets`, `/transfer` redirect here.

### Database schema (key points)

- All timestamps are **milliseconds since epoch** (not ISO strings, not Unix seconds)
- All IDs are UUIDs (`crypto.randomUUID()`)
- `settings` table is a flat key/value store — AI credentials live here, not in env vars
- `generation_log` stores every AI-generated letter; `version` increments per application
- `vault_documents.extracted_text` is populated at upload time; if null, the AI receives no CV content

### Styling

Tailwind v3 with `darkMode: 'class'` + CSS custom properties for the theme system. Primary colour palette = purple (`primary-500: #a855f7`). Global gradient: `#a855f7 → #ec4899`. Component classes (`btn-primary`, `btn-secondary`, `input`, `label`) defined in `index.css` `@layer components`. Use inline `theme.*` values (from `useTheme()`) for dynamic theme-aware colours in components that need to respond to theme changes at runtime.

## Health Stack

- typecheck-server: cd server && npx tsc --noEmit
- typecheck-client: cd client && npx tsc --noEmit
- test: npm test
- deadcode: npm run deadcode
