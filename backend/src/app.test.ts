import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app";

// vi.hoisted lifts these above the imports, so the mock factories below
// can reference them even though vi.mock is itself hoisted.
const { poolQuery, redisPing, checkEmbeddingDimensions } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  redisPing: vi.fn(),
  checkEmbeddingDimensions: vi.fn(),
}));

vi.mock("./config/db", () => ({
  pool: { query: poolQuery, on: vi.fn(), connect: vi.fn(), end: vi.fn() },
  createPool: vi.fn(),
  checkDbConnection: vi.fn(),
  checkEmbeddingDimensions,
  closePool: vi.fn(),
}));

vi.mock("./config/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config/redis")>();

  return {
    ...actual,
    redis: {
      isOpen: true,
      ping: redisPing,
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(true),
      ttl: vi.fn().mockResolvedValue(60),
      // Rejecting exercises the fail-open path in the rate limiter.
      sendCommand: vi.fn().mockRejectedValue(new Error("redis offline")),
      on: vi.fn(),
    },
    ensureRedis: vi.fn().mockResolvedValue(undefined),
    checkRedisConnection: vi.fn(),
    closeRedis: vi.fn(),
  };
});

describe("health endpoints", () => {
  beforeEach(() => {
    poolQuery.mockReset().mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });
    redisPing.mockReset().mockResolvedValue("PONG");
    checkEmbeddingDimensions.mockReset().mockResolvedValue(undefined);
  });

  it("answers liveness without touching any dependency", async () => {
    poolQuery.mockRejectedValue(new Error("database down"));

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("reports ok when the database answers", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      checks: { database: { ok: true }, cache: { ok: true } },
    });
  });

  it("fails readiness with 503 when the database is unreachable", async () => {
    poolQuery.mockRejectedValue(new Error("connection refused"));

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.checks.database).toMatchObject({ ok: false });
  });

  it("fails readiness when the schema and EMBED_DIMENSIONS disagree", async () => {
    // A width mismatch breaks every insert and every similarity query, so it
    // must fail readiness rather than surface as a confusing runtime error.
    checkEmbeddingDimensions.mockRejectedValue(
      new Error("Embedding dimension mismatch: chunks.embedding is vector(2000)"),
    );

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body.checks.database.error).toContain("dimension mismatch");
  });

  it("stays ready when only the cache is down, because caching is optional", async () => {
    redisPing.mockRejectedValue(new Error("redis offline"));

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.checks.cache).toMatchObject({ ok: false });
  });
});

describe("request correlation", () => {
  beforeEach(() => {
    poolQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("returns a request id on every response", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
  });

  it("echoes a caller-supplied request id so traces join up", async () => {
    const response = await request(app).get("/health").set("X-Request-Id", "trace-abc");

    expect(response.headers["x-request-id"]).toBe("trace-abc");
  });
});

describe("error responses", () => {
  beforeEach(() => {
    poolQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("returns a structured 404 for an unknown route", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "Route not found", code: "NOT_FOUND" });
    expect(response.body.request_id).toBeTruthy();
  });

  it("rejects a query with no question and names the offending field", async () => {
    const response = await request(app).post("/api/v1/query").send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.details).toContainEqual(
      expect.objectContaining({ field: "query" }),
    );
  });

  it("rejects a whitespace-only question", async () => {
    const response = await request(app).post("/api/v1/query").send({ query: "   " });

    expect(response.status).toBe(400);
  });

  it("rejects a top_k above the allowed ceiling", async () => {
    const response = await request(app)
      .post("/api/v1/query")
      .send({ query: "valid question", top_k: 99 });

    expect(response.status).toBe(400);
    expect(response.body.details).toContainEqual(
      expect.objectContaining({ field: "top_k" }),
    );
  });

  it("rejects a collection with no name", async () => {
    const response = await request(app).post("/api/v1/collections").send({ name: "  " });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-numeric collection id on delete", async () => {
    const response = await request(app).delete("/api/v1/collections/not-a-number");

    expect(response.status).toBe(400);
  });

  it("maps a missing collection to 404 rather than 500", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const response = await request(app).delete("/api/v1/collections/999");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });

  it("maps a duplicate collection name to 409", async () => {
    poolQuery.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));

    const response = await request(app).post("/api/v1/collections").send({ name: "Reports" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("DUPLICATE_COLLECTION");
  });

  it("returns a generic 500 for an unexpected failure", async () => {
    poolQuery.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const response = await request(app).get("/api/v1/collections");

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
    // Suppressing the underlying message is a production-only behaviour; see
    // errorHandler.test.ts for that guarantee.
  });
});

describe("collections", () => {
  beforeEach(() => {
    poolQuery.mockReset();
  });

  it("returns collections with their document and chunk counts", async () => {
    poolQuery.mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "Demo",
          created_at: "2026-01-01T00:00:00.000Z",
          document_count: 2,
          chunk_count: 84,
        },
      ],
      rowCount: 1,
    });

    const response = await request(app).get("/api/v1/collections");

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ document_count: 2, chunk_count: 84 });
  });
});

describe("CORS", () => {
  beforeEach(() => {
    poolQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("allows a configured origin", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("allows an extra origin listed in CORS_ORIGINS", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:4173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:4173");
  });

  it("refuses an unlisted origin", async () => {
    const response = await request(app).get("/health").set("Origin", "https://evil.example.com");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("security headers", () => {
  it("does not advertise the framework", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
