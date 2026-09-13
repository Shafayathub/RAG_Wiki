# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Layout

pnpm workspace with two packages plus a deployment shim:

- `backend/` — Express 5 API (`@rag-wiki/backend`)
- `frontend/` — React 19 + Vite SPA (`@rag-wiki/frontend`)
- `api/index.ts` — Vercel serverless entry point; re-exports the Express app

Run every command from the repository root unless noted.

## Commands

```bash
pnpm install          # install the whole workspace
pnpm dev              # API on :5000 and web on :5173, both watching
pnpm verify           # typecheck + lint + test + build (the CI gate)
pnpm test             # both suites
pnpm test:coverage    # both suites with coverage
pnpm typecheck        # api shim, backend and frontend
pnpm lint             # both packages
pnpm build            # compile the API, build the web bundle
pnpm migrate          # apply pending SQL migrations
pnpm seed             # load the demo collection (safe to re-run)
```

Run `pnpm verify` before declaring work finished. It is exactly what CI runs.

## Environment

Copy `.env.example` to `backend/.env`. Every variable is validated by Zod in
`backend/src/config/env.ts`, which throws a named error at startup on anything
missing or malformed, so add new configuration there rather than reading
`process.env` directly elsewhere.

Two values are easy to get wrong:

- `DATABASE_URL` must be the **pooled** Postgres string on serverless.
- `REDIS_URL` must be the **RESP** URL (`rediss://`), not the Upstash REST URL.

## Conventions

- **Validation at the boundary.** Every request body and route param goes
  through a Zod schema in the module `.schema.ts` file. Controllers call
  `safeParse` and hand the error to `next`.
- **Errors.** Throw `AppError(status, message, code)` from `utils/AppError`.
  There is exactly one `AppError` class; `types/index.ts` re-exports it so both
  import paths resolve to the same constructor, which `instanceof` depends on.
- **Logging.** Use `req.log` inside a request and the module `logger`
  elsewhere. Never `console.log`.
- **Caching is best-effort.** Wrap every Redis read and write so a failure
  degrades to a miss. The general rate limiter fails open; the budget limiters
  in `middleware/llmLimiter.ts` fall back to an in-process counter instead,
  because the endpoints they guard spend money.
- **Serverless.** Await anything that must happen before the response ends; an
  instance freezes immediately afterwards and drops pending promises.
- **Comments explain why, not what.** The code says what it does.

## Testing

Vitest in both packages, 110 tests. Backend env for tests is declared in
`backend/vitest.config.ts` (not a setup file) so it exists before module-level
validation runs. Mock `config/db` and `config/redis` with `vi.hoisted` when a
test boots the Express app.

Frontend tests use jsdom and Testing Library, and are typechecked by
`frontend/tsconfig.test.json` so the production build never compiles them.

## Documentation

- `docs/ARCHITECTURE.md` — design decisions and their rationale
- `docs/API.md` — endpoint and SSE event reference
- `docs/DEPLOYMENT.md` — Vercel, Neon and Upstash setup
- `docs/phases/` — historical build notes, not current design

Keep these in sync when behaviour changes.
