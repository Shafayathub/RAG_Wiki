# Deploying to Vercel

The whole application ships as **one Vercel project**: the React bundle as
static files on the CDN, and the Express API as a single serverless function.
Both are served from the same origin, so there is no CORS configuration to get
wrong in production and no second URL to manage.

Total cost on the free tiers described here is zero.

---

## 1. Provision the two managed services

### Postgres with pgvector — Neon

1. Create a project at [neon.tech](https://neon.tech).
2. In the SQL editor, enable the extension:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. Copy the **pooled** connection string, the one whose host contains
   `-pooler`. This matters: every serverless invocation is a separate instance
   with its own connection, and the direct string runs out of connections long
   before the pooled one does.

### Redis — Upstash

1. Create a database at [upstash.com](https://upstash.com), in a region close
   to your Vercel region.
2. Copy the **RESP** URL, which starts with `rediss://`. The `https://` REST URL
   shown first on the dashboard speaks a different protocol and will not work.
   The application rejects it at startup with a message saying so, rather than
   failing later with an opaque socket error.

### Model access — OpenRouter

Create a key at [openrouter.ai](https://openrouter.ai). Any OpenAI-compatible
provider works by changing `baseURL` in `backend/src/config/openrouter.ts`.

---

## 2. Prepare the database

Run the migrations once from your machine, pointed at the production database:

```bash
DATABASE_URL="postgresql://...-pooler.../ragwiki?sslmode=require" pnpm migrate
```

Each file in `backend/migrations/` runs inside its own transaction and is
recorded in a `schema_migrations` table, so re-running applies only what is new.

Optionally load the demo collection so the live site is not empty for a first
visitor:

```bash
pnpm seed
```

This needs `DATABASE_URL`, `REDIS_URL` and `OPENROUTER_API_KEY`, since it runs
the real ingestion pipeline. It clears and rewrites the demo collection, so it
is safe to run again.

---

## 3. Create the Vercel project

Import the repository at [vercel.com/new](https://vercel.com/new). Leave every
build setting on its default: `vercel.json` already declares the install
command, build command, output directory, function limits, routing and security
headers.

Set the **Root Directory** to the repository root, not `frontend/`. The build
needs the whole workspace.

---

## 4. Set the environment variables

Under **Settings, Environment Variables**, add these for Production (and
Preview, if you want preview deploys to work):

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Neon **pooled** connection string |
| `REDIS_URL` | The Upstash `rediss://` URL |
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `APP_URL` | The deployed URL, for example `https://rag-wiki.vercel.app` |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` for a public demo |
| `ADMIN_TOKEN` | A random string of at least 16 characters |
| `MAX_FILE_SIZE_MB` | `4` |

The remaining variables in `.env.example` have sensible defaults and can be
omitted. `APP_URL` is a chicken-and-egg problem on the very first deploy: deploy
once, copy the URL Vercel assigns, set it, and redeploy.

With `DEMO_MODE` on, `DELETE /api/v1/collections/:id` requires the
`X-Admin-Token` header, so a visitor cannot wipe your seeded content while you
keep full control with the token.

---

## 5. Deploy and verify

```bash
curl https://your-app.vercel.app/health
curl https://your-app.vercel.app/api/v1/health
```

The first is liveness and touches nothing. The second reports each dependency
separately, so a misconfigured `DATABASE_URL` or `REDIS_URL` shows up as a named
failing check rather than a blank page:

```json
{
  "status": "ok",
  "checks": { "database": { "ok": true }, "cache": { "ok": true } }
}
```

Then open the site, ask one of the suggested questions, and confirm the answer
streams in and the sources panel opens.

---

## Serverless constraints that shaped the configuration

**Request bodies are capped at 4.5MB.** This is a platform limit, not an
application one, and it cannot be raised. `MAX_FILE_SIZE_MB=4` keeps uploads
under it so a large file is rejected with a clear 413 rather than a platform
error. Self-hosted deployments can raise it freely.

**Functions time out.** `vercel.json` sets `maxDuration` to 60 seconds, the
Hobby ceiling. Ingestion is the slow path, since it embeds every chunk, so a
very large PDF can approach it. The embedder batches twenty chunks per request
rather than sending them one at a time, which is what keeps a normal document
well inside the budget.

**Instances freeze the moment a response ends.** Anything still pending is
dropped. The query pipeline therefore awaits its cache write and its analytics
insert instead of leaving them floating.

**Connections do not pool across instances.** The Postgres pool is capped at one
connection per instance when `VERCEL` is set, and Redis connects lazily on first
use and is reused for the life of the instance.

**Streaming needs buffering disabled.** The SSE response sets
`X-Accel-Buffering: no` and `Cache-Control: no-transform`, without which an edge
proxy can hold the whole answer and deliver it in one piece.

---

## Fallback: split frontend and backend

If you would rather run the API as a long-lived server, for large uploads or
slow ingestion, deploy the backend separately to Render, Fly.io or Railway:

1. Deploy `backend/` with build `pnpm install && pnpm build` and start
   `node dist/server.js`.
2. On the backend host, set `CORS_ORIGINS` to your Vercel URL.
3. On Vercel, set `VITE_API_BASE_URL` to `https://your-api.example.com/api/v1`
   and remove the `/api/(.*)` rewrite from `vercel.json`.

The trade-off is a second URL and, on free tiers that sleep after inactivity, a
cold start of roughly a minute on the first request.

---

## Troubleshooting

**Startup fails with a list of environment variables.** Zod validated the
configuration and named every missing or malformed value. Fix them in Vercel and
redeploy.

**`REDIS_URL must start with redis:// or rediss://`.** The Upstash REST URL was
pasted instead of the RESP one.

**Readiness reports the database down.** Usually the direct Neon connection
string instead of the pooled one, or a missing `?sslmode=require`.

**Answers arrive all at once instead of streaming.** A proxy is buffering.
Confirm the response carries `Content-Type: text/event-stream` and
`X-Accel-Buffering: no`.

**Every question returns 429.** The per-IP budget limiter is doing its job.
Raise `LLM_RATE_LIMIT_MAX` or shorten `LLM_RATE_LIMIT_WINDOW_MS`.
