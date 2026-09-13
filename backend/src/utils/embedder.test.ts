import { beforeEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "./embedder";
import { AppError } from "../types";

const { createEmbeddings, redisMGet, redisSet } = vi.hoisted(() => ({
  createEmbeddings: vi.fn(),
  redisMGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("../config/openrouter", () => ({
  llm: { embeddings: { create: createEmbeddings } },
}));

vi.mock("../config/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/redis")>();
  return {
    ...actual,
    redis: { mGet: redisMGet, set: redisSet },
  };
});

describe("embedTexts", () => {
  beforeEach(() => {
    createEmbeddings.mockReset();
    // Every text is a cache miss, so each call reaches the provider mock.
    redisMGet.mockReset().mockResolvedValue([null, null, null]);
    redisSet.mockReset().mockResolvedValue("OK");
  });

  it("orders vectors by the response index, not by arrival order", async () => {
    createEmbeddings.mockResolvedValue({
      data: [
        { index: 2, embedding: [3] },
        { index: 0, embedding: [1] },
        { index: 1, embedding: [2] },
      ],
    });

    const result = await embedTexts(["one", "two", "three"]);

    expect(result).toEqual([[1], [2], [3]]);
  });

  it("rejects a response that is missing a vector rather than storing a hole", async () => {
    // The guard used to run `some()` over a sparse array, which skips holes and
    // so never fired — the gap reached the database as a chunk's embedding.
    createEmbeddings.mockResolvedValue({
      data: [
        { index: 0, embedding: [1] },
        { index: 2, embedding: [3] },
      ],
    });

    await expect(embedTexts(["one", "two", "three"])).rejects.toMatchObject({
      statusCode: 502,
      code: "EMBEDDING_FAILED",
    });
  });

  it("rejects an empty response for the same reason", async () => {
    createEmbeddings.mockResolvedValue({ data: [] });

    await expect(embedTexts(["one", "two", "three"])).rejects.toBeInstanceOf(AppError);
  });

  it("makes no provider call when there is nothing to embed", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(createEmbeddings).not.toHaveBeenCalled();
  });
});
