import { z } from "zod";

export const queryBodySchema = z.object({
  query: z.string().min(1, "query is required").max(1000),
  collection_id: z.number().int().positive().optional(),
  top_k: z.number().int().min(1).max(20).default(5),
});

export type QueryBody = z.infer<typeof queryBodySchema>;
