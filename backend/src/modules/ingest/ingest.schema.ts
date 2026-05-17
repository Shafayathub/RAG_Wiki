import { z } from "zod";

export const ingestBodySchema = z.object({
  collection_name: z
    .string()
    .min(1, "collection_name is required")
    .max(100, "collection_name too long"),
});

export type IngestBody = z.infer<typeof ingestBodySchema>;
