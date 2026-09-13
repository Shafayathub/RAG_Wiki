import { z } from "zod";

export const createCollectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name must be 100 characters or fewer"),
});

export const collectionIdParamSchema = z.object({
  id: z.coerce.number().int().positive("id must be a positive integer"),
});

export type CreateCollectionBody = z.infer<typeof createCollectionSchema>;
