# AGENTS.md

## Key Commands

```bash
npm run dev      # Start server (3071) + client (3070) with hot-reload
npm run build    # Production build
npm start        # Run production server
npm test         # Run vitest integration tests
npm run deadcode # Check for unused code (knip)
```

## Typecheck

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

## Architecture

- **Monorepo**: npm workspaces with `server/` + `client/`
- **Production**: Server serves built client as SPA fallback
- **Database**: SQLite at `./data/applyr.db` (dev) or `~/.applyr/data/` (prod)
- **Timestamps**: Milliseconds since epoch (not ISO strings)
- **IDs**: UUIDs via `crypto.randomUUID()`

## Common Pitfalls

- AI credentials come from `settings` table, not env vars
- Vault documents need `extracted_text` populated at upload time
- SSE endpoints emit `{ token }` chunks then final `{ done, fullText, fitScore? }`
- All timestamps in DB are milliseconds, not seconds

## Testing

Integration tests run against real SQLite DB in `tests/`. Use `npm test` or `npm run test:watch`.

## Files

- `server/src/index.ts` - Express boot, calls `initDb()`
- `server/src/app.ts` - Mounts `/api/*` routes, serves static in prod
- `server/src/db/connection.ts` - `getDb()` singleton, `initDb()` at startup
- `server/src/db/migrations/` - SQL migration files

See `CLAUDE.md` for full architecture details.