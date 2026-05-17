import { Router } from "express";
import { uploadDocument } from "./ingest.controller";

const router: Router = Router();

// multer is wired inside the controller — keeps the router clean
router.post("/", uploadDocument);

export { router as ingestRouter };
