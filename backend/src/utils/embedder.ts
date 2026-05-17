import { llm } from "../config/openrouter";
import { redis, CacheKeys } from "../config/redis";
import { config } from "../config/env";
import { RawChunk, EmbeddedChunk } from "../types";

/**
 * Embed a single piece of text.
 * Checks the embedding cache first — a cache hit costs $0.
 * Cache miss calls OpenRouter → stores result for 24 hours.
 */
async function embedText(text: string): Promise<number[]> {
    const cacheKey = CacheKeys.embedding(text);

    // ── Cache check ───────────────────────────────────────────────────────────
    try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis down — skip cache, call API directly
    }

    // ── OpenRouter embedding call ─────────────────────────────────────────────
    const response = await llm.embeddings.create({
        model: config.openRouterEmbedModel,
        input: text,
        dimensions: config.embedDimensions,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
        throw new Error("No embedding returned from OpenRouter");
    }

    // ── Store in cache ────────────────────────────────────────────────────────
    try {
        await redis.set(cacheKey, JSON.stringify(embedding), { EX: config.cacheTtlEmbedding });
    } catch {
        // Cache write failed — not fatal, continue
    }

    return embedding;
}

/**
 * Embed all chunks in batches of 20.
 *
 * Why batching?
 * OpenRouter (and OpenAI) have per-request token limits.
 * Sending 200 chunks at once risks hitting those limits.
 * Batches of 20 stay well under the ceiling while being
 * far faster than one-at-a-time sequential calls.
 */
export async function embedChunks(chunks: RawChunk[]): Promise<EmbeddedChunk[]> {
    const BATCH_SIZE = 20;
    const embedded: EmbeddedChunk[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(async (chunk): Promise<EmbeddedChunk> => {
                const embedding = await embedText(chunk.content);
                return { ...chunk, embedding };
            }),
        );

        embedded.push(...batchResults);

        // Small delay between batches to respect rate limits
        if (i + BATCH_SIZE < chunks.length) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    return embedded;
}