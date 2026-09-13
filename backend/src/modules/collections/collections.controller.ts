import type { NextFunction, Request, Response } from "express";
import {
  collectionIdParamSchema,
  createCollectionSchema,
} from "./collections.schema";
import {
  fetchAllCollections,
  insertCollection,
  removeCollection,
} from "./collections.service";

export async function getAllCollections(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ data: await fetchAllCollections() });
  } catch (err) {
    next(err);
  }
}

export async function createCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = createCollectionSchema.safeParse(req.body);
  if (!parsed.success) {
    next(parsed.error);
    return;
  }

  try {
    res.status(201).json({ data: await insertCollection(parsed.data.name) });
  } catch (err) {
    next(err);
  }
}

export async function deleteCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = collectionIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    next(parsed.error);
    return;
  }

  try {
    await removeCollection(parsed.data.id);
    res.json({ message: "Collection deleted" });
  } catch (err) {
    next(err);
  }
}
