import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger";

/**
 * Stamps every request with an id, exposes a request-scoped logger, and logs
 * one completion line. The id also travels back in the error response so a
 * user-reported failure can be found in the logs directly.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.header("x-request-id");
  req.id = inbound && inbound.length <= 200 ? inbound : randomUUID();
  req.log = logger.child({ requestId: req.id });

  res.setHeader("X-Request-Id", req.id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fields = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    };

    if (res.statusCode >= 500) req.log.error("Request failed", undefined, fields);
    else if (res.statusCode >= 400) req.log.warn("Request rejected", fields);
    else req.log.info("Request completed", fields);
  });

  next();
};
