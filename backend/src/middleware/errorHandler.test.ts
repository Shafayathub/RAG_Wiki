import type { Request, Response } from "express";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/AppError";
import { errorHandler } from "./errorHandler";

const environment = vi.hoisted(() => ({ isProduction: false }));

vi.mock("../config/env", () => ({
  config: {
    get isProduction() {
      return environment.isProduction;
    },
  },
}));

function fakeRequest(): Request {
  return {
    id: "req-123",
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  } as unknown as Request;
}

function fakeResponse() {
  const res = {
    headersSent: false,
    statusCode: 200,
    status: vi.fn(function status(this: unknown, code: number) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(),
  };

  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function handle(error: unknown, res = fakeResponse()) {
  errorHandler(error, fakeRequest(), res, vi.fn());
  return { res, body: res.json.mock.calls[0]?.[0] };
}

describe("errorHandler", () => {
  beforeEach(() => {
    environment.isProduction = false;
  });

  it("maps an AppError to its own status and code", () => {
    const { res, body } = handle(new AppError(404, "Collection not found", "NOT_FOUND"));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(body).toMatchObject({ error: "Collection not found", code: "NOT_FOUND" });
  });

  it("maps a ZodError to 400 with per-field detail", () => {
    const schema = z.object({ query: z.string().min(1) });
    const failure = schema.safeParse({ query: "" });

    const { res, body } = handle(failure.error);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toContainEqual(expect.objectContaining({ field: "query" }));
  });

  it("includes the request id so a report can be traced to a log line", () => {
    const { body } = handle(new AppError(400, "bad", "BAD"));

    expect(body.request_id).toBe("req-123");
  });

  it("suppresses the underlying message in production", () => {
    environment.isProduction = true;

    const { res, body } = handle(new Error("password=hunter2 host=internal.db"));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(body).toMatchObject({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  it("surfaces the underlying message outside production, to aid debugging", () => {
    const { body } = handle(new Error("something specific broke"));

    expect(body.detail).toBe("something specific broke");
  });

  it("logs unexpected errors but not handled ones", () => {
    const request = fakeRequest();

    errorHandler(new AppError(404, "missing", "NOT_FOUND"), request, fakeResponse(), vi.fn());
    expect(request.log.error).not.toHaveBeenCalled();

    errorHandler(new Error("boom"), request, fakeResponse(), vi.fn());
    expect(request.log.error).toHaveBeenCalledOnce();
  });

  it("writes nothing once the response has already started streaming", () => {
    const res = fakeResponse();
    (res as { headersSent: boolean }).headersSent = true;

    handle(new Error("too late"), res);

    expect(res.json).not.toHaveBeenCalled();
  });

  it("handles a thrown non-Error value without crashing", () => {
    const { res, body } = handle("just a string");

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
