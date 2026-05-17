import { Router } from "express";
import { llmCostLimiter } from "../../middleware/llmLimiter";
import { handleQuery } from "./query.controller";

const router: Router = Router();

// LLM cost limiter applied only to this route
router.post("/", llmCostLimiter, handleQuery);

export { router as queryRouter };
