import { Router } from "express";
import { ingestCostLimiter } from "../../middleware/llmLimiter";
import { uploadDocument } from "./ingest.controller";

const router: Router = Router();

// multer is wired inside the controller — keeps the router clean.
// The cost limiter runs first: every upload bills embeddings for every chunk,
// which makes this the most expensive endpoint in the app, not the cheapest.
router.post("/", ingestCostLimiter, uploadDocument);

export { router as ingestRouter };
