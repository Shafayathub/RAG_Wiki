import { Router } from "express";
import { llmCostLimiter } from "../../middleware/llmLimiter";
import { handleQuery } from "./query.controller";

const router: Router = Router();

// The retrieval-only debug route that used to live here was removed: it ran a
// paid embedding call per request with no cost limiter in front of it.
router.post("/", llmCostLimiter, handleQuery);

export { router as queryRouter };
