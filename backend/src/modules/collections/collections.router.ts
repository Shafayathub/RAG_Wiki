import { Router } from "express";
import {
  getAllCollections,
  createCollection,
  deleteCollection,
} from "./collections.controller";

const router: Router = Router();

router.get("/", getAllCollections);
router.post("/", createCollection);
router.delete("/:id", deleteCollection);

export { router as collectionsRouter };
