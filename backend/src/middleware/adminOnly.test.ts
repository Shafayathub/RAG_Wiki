import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminOnly } from "./adminOnly";

const environment = vi.hoisted(() => ({
  demoMode: false,
  adminToken: undefined as string | undefined,
}));

vi.mock("../config/env", () => ({
  config: {
    get demoMode() {
      return environment.demoMode;
    },
    get adminToken() {
      return environment.adminToken;
    },
  },
}));

const VALID_TOKEN = "a-sufficiently-long-admin-token";

function fakeRequest(token?: string): Request {
  return {
    id: "req-1",
    header: (name: string) =>
      name.toLowerCase() === "x-admin-token" ? token : undefined,
  } as unknown as Request;
}

function fakeResponse() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("adminOnly", () => {
  beforeEach(() => {
    environment.demoMode = false;
    environment.adminToken = undefined;
  });

  it("is a no-op outside demo mode, so self-hosting is unaffected", () => {
    const next = vi.fn();
    const res = fakeResponse();

    adminOnly(fakeRequest(), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks a destructive request in demo mode when no token is sent", () => {
    environment.demoMode = true;
    environment.adminToken = VALID_TOKEN;

    const next = vi.fn();
    const res = fakeResponse();

    adminOnly(fakeRequest(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({ code: "DEMO_READ_ONLY" });
  });

  it("blocks a wrong token", () => {
    environment.demoMode = true;
    environment.adminToken = VALID_TOKEN;

    const next = vi.fn();
    adminOnly(fakeRequest("not-the-right-token-value"), fakeResponse(), next);

    expect(next).not.toHaveBeenCalled();
  });

  it("blocks a token that is a prefix of the real one", () => {
    environment.demoMode = true;
    environment.adminToken = VALID_TOKEN;

    const next = vi.fn();
    adminOnly(fakeRequest(VALID_TOKEN.slice(0, 10)), fakeResponse(), next);

    expect(next).not.toHaveBeenCalled();
  });

  it("admits the correct token", () => {
    environment.demoMode = true;
    environment.adminToken = VALID_TOKEN;

    const next = vi.fn();
    const res = fakeResponse();

    adminOnly(fakeRequest(VALID_TOKEN), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails closed when demo mode is on but no token is configured", () => {
    environment.demoMode = true;
    environment.adminToken = undefined;

    const next = vi.fn();
    const res = fakeResponse();

    adminOnly(fakeRequest(VALID_TOKEN), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
