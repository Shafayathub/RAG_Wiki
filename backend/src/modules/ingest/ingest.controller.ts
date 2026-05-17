import { Request, Response, NextFunction } from "express";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import os from "os";
import { ingestBodySchema } from "./ingest.schema";
import { ingestDocument } from "./ingest.service";
import { AppError } from "../../types";
import { config } from "../../config/env";

// ── Multer config ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Write to OS temp dir — cleaned up in ingest.service after processing
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    // Prefix with timestamp to avoid collisions when two users
    // upload a file with the same name at the same time
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  const allowed = [".pdf", ".md", ".markdown"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError(400, `File type ${ext} not allowed. Upload PDF or Markdown.`, "INVALID_FILE_TYPE"));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
});

// ── Controller ────────────────────────────────────────────────────────────────

export function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Run multer as middleware first, then handle the request
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new AppError(413, `File too large. Max size is ${config.maxFileSizeMb}MB.`, "FILE_TOO_LARGE"),
        );
      }
      return next(new AppError(400, err.message, "UPLOAD_ERROR"));
    }

    if (err) return next(err);

    if (!req.file) {
      return next(new AppError(400, "No file uploaded. Include a file field named 'file'.", "NO_FILE"));
    }

    // Validate body
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }

    try {
      const result = await ingestDocument(
        req.file.path,
        req.file.originalname,
        parsed.data.collection_name,
      );
      res.status(201).json({ data: result });
    } catch (serviceErr) {
      next(serviceErr);
    }
  });
}