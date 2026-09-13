import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "../config/env";

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and the length itself is not
  // a secret worth protecting.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Guards destructive endpoints on the public demo. Outside DEMO_MODE this is a
 * no-op, so local development and self-hosted deployments are unaffected.
 */
export const adminOnly: RequestHandler = (req, res, next) => {
  if (!config.demoMode) {
    next();
    return;
  }

  const provided = req.header("x-admin-token");

  if (provided && config.adminToken && tokensMatch(provided, config.adminToken)) {
    next();
    return;
  }

  res.status(403).json({
    error: "This deployment is a read-only public demo. Destructive actions are disabled.",
    code: "DEMO_READ_ONLY",
    request_id: req.id,
  });
};
