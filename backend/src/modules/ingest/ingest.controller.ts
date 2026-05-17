import { Request, Response, NextFunction } from "express";

export async function uploadDocument(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Phase 2: multer + ingest.service wired here
    res.status(501).json({ message: "Ingestion pipeline — Phase 2" });
  } catch (err) {
    next(err);
  }
}
