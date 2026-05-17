import { Request, Response, NextFunction } from "express";

export async function handleQuery(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Phase 6: cache → retriever → context builder → LLM stream wired here
    res.status(501).json({ message: "Query pipeline — Phase 6" });
  } catch (err) {
    next(err);
  }
}
