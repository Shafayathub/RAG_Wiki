import { Router, Request, Response, NextFunction } from "express";
import { llmCostLimiter } from "../../middleware/llmLimiter";
import { handleQuery } from "./query.controller";
import { queryBodySchema } from "./query.schema";
import { hybridSearch } from "../../utils/retriever";

const router: Router = Router();

// ── Temporary retrieval test route — remove after Phase 6 ────────────────────
router.post(
  "/retrieve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = queryBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const { query, collection_id, top_k } = parsed.data;
      const results = await hybridSearch(query, collection_id, top_k);

      res.json({
        data: results,
        count: results.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// LLM cost limiter applied only to this route
router.post("/", llmCostLimiter, handleQuery);

export { router as queryRouter };
