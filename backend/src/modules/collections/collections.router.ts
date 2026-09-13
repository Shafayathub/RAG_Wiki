import { Router } from "express";
import { adminOnly } from "../../middleware/adminOnly";
import {
  createCollection,
  deleteCollection,
  getAllCollections,
} from "./collections.controller";

const router: Router = Router();

router.get("/", getAllCollections);
router.post("/", createCollection);
router.delete("/:id", adminOnly, deleteCollection);

export { router as collectionsRouter };
