import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmCostLimiter } from "./llmLimiter";
import { config } from "../config/env";

const { redisEval } = vi.hoisted(() => ({ redisEval: vi.fn() }));

vi.mock("../config/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/redis")>();
  return { ...actual, redis: { eval: redisEval } };
});

function callLimiter(ip: string) {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  const req = {
    ip,
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as Request;

  return { req, res, next, json, run: () => llmCostLimiter(req, res, next) };
}

describe("llmCostLimiter", () => {
  beforeEach(() => {
    redisEval.mockReset();
  });

  it("passes a request that is within budget", async () => {
    redisEval.mockResolvedValue([1, 3600]);

    const { run, next, res } = callLimiter("1.1.1.1");
    await run();

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects with 429 and a retry hint once the budget is spent", async () => {
    redisEval.mockResolvedValue([config.llmRateLimitMax + 1, 120]);

    const { run, next, res, json } = callLimiter("2.2.2.2");
    await run();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "LLM_RATE_LIMIT_EXCEEDED",
        retry_after_seconds: 120,
      }),
    );
  });

  it("keeps counting in-process when Redis is unreachable, instead of failing open", async () => {
    // The general rate limiter is allowed to fail open. This one guards the
    // only endpoint that spends money, so an outage must not make it free.
    redisEval.mockRejectedValue(new Error("redis offline"));

    const ip = "3.3.3.3";
    for (let i = 0; i < config.llmRateLimitMax; i++) {
      const allowed = callLimiter(ip);
      await allowed.run();
      expect(allowed.next).toHaveBeenCalledOnce();
    }

    const blocked = callLimiter(ip);
    await blocked.run();

    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.status).toHaveBeenCalledWith(429);
  });

  it("counts each client separately in the in-process fallback", async () => {
    redisEval.mockRejectedValue(new Error("redis offline"));

    const other = callLimiter("4.4.4.4");
    await other.run();

    expect(other.next).toHaveBeenCalledOnce();
  });
});
