import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { config } from "../config/env";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // Express identifies error middleware by arity: the fourth parameter has
  // to stay even though nothing calls it.
  _next,
): void => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      code: "VALIDATION_ERROR",
      request_id: req.id,
      details: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      request_id: req.id,
    });
    return;
  }

  req.log.error("Unhandled error", err);

  // Never echo an unexpected error's message: it can carry upstream API
  // payloads, connection strings or file paths.
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    request_id: req.id,
    ...(config.isProduction || !(err instanceof Error)
      ? {}
      : { detail: err.message }),
  });
};
