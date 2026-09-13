import { Router } from "express";
import { adminOnly } from "../../middleware/adminOnly";
import {
  createCollection,
  deleteCollection,
  getAllCollections,
} from "./collections.controller";

const router: Router = Router();

router.get("/", getAllCollections);
// Creating an empty collection is only useful to an operator; the upload flow
// creates collections by name on demand. Leaving it open let a stranger fill
// the public collection list with junk.
router.post("/", adminOnly, createCollection);
router.delete("/:id", adminOnly, deleteCollection);

export { router as collectionsRouter };
