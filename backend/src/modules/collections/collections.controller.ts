import { Request, Response, NextFunction } from "express";
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
    const collections = await fetchAllCollections();
    res.json({ data: collections });
  } catch (err) {
    next(err);
  }
}

export async function createCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name } = req.body as { name: string };
    const collection = await insertCollection(name);
    res.status(201).json({ data: collection });
  } catch (err) {
    next(err);
  }
}

export async function deleteCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idParam = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const id = parseInt(idParam ?? "", 10);
    await removeCollection(id);
    res.json({ message: "Collection deleted" });
  } catch (err) {
    next(err);
  }
}
