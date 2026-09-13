import { z } from "zod";
import { config } from "../../config/env";

export const queryBodySchema = z.object({
  query: z.string().trim().min(1, "query is required").max(1000),
  collection_id: z.coerce.number().int().positive().optional(),
  top_k: z.coerce.number().int().min(1).max(20).default(config.topKResults),
});

export type QueryBody = z.infer<typeof queryBodySchema>;
