import express, { type Express, type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { checkEmbeddingDimensions, pool } from "./config/db";
import { redis } from "./config/redis";
import { requestContext } from "./middleware/requestContext";
import { redisReady } from "./middleware/redisReady";
import { ipRateLimiter } from "./middleware/rateLimiter";
import { errorHandler } from "./middleware/errorHandler";
import { ingestRouter } from "./modules/ingest/ingest.router";
import { queryRouter } from "./modules/query/query.router";
import { collectionsRouter } from "./modules/collections/collections.router";

const app: Express = express();

// Vercel and every other managed host terminate TLS at a proxy. Without this
// req.ip is the proxy's address and per-IP limits apply to the whole world at
// once. `1` trusts exactly one hop rather than blindly trusting the header.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    // The API returns JSON only; the SPA is served as static files by the CDN.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin browser requests and server-to-server calls (curl, health
    // checks) send no Origin header at all.
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  allowedHeaders: ["Content-Type", "X-Admin-Token", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86_400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(requestContext);

// ── Liveness — deliberately dependency-free so it answers during an outage ───
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", redisReady, ipRateLimiter);

// ── Readiness — reports which dependency is down, and why ────────────────────
// Registered after the limiter deliberately: it runs a real query and a real
// PING on every hit, so above it, it would be an unmetered way to exhaust the
// single Postgres connection each serverless instance gets. Uptime monitors
// should poll /health, which is free and touches nothing.
app.get("/api/v1/health", async (_req: Request, res: Response) => {
  const [database, cache] = await Promise.all([
    pool
      .query("SELECT 1")
      .then(() => checkEmbeddingDimensions())
      .then(() => ({ ok: true }) as const)
      .catch((err: Error) => ({ ok: false, error: err.message }) as const),
    redis
      .ping()
      .then(() => ({ ok: true }) as const)
      .catch((err: Error) => ({ ok: false, error: err.message }) as const),
  ]);

  // Redis is a cache, not a source of truth — losing it degrades latency and
  // rate limiting but the app still answers, so it must not fail readiness.
  res.status(database.ok ? 200 : 503).json({
    status: database.ok ? "ok" : "degraded",
    checks: { database, cache },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/ingest", ingestRouter);
app.use("/api/v1/query", queryRouter);
app.use("/api/v1/collections", collectionsRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Route not found",
    code: "NOT_FOUND",
    request_id: req.id,
  });
});

app.use(errorHandler);

export default app;
