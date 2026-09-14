import { describe, expect, it } from "vitest";
import { fuseWithRRF } from "./retriever";

interface Row {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
}

function row(chunkId: number): Row {
  return {
    chunk_id: chunkId,
    document_id: 1,
    filename: "doc.md",
    content: `content ${chunkId}`,
    page_number: null,
    chunk_index: chunkId,
  };
}

const vector = (ids: number[]) => ids.map((id) => ({ ...row(id), vector_score: 0.1 }));
const fts = (ids: number[]) => ids.map((id) => ({ ...row(id), fts_rank: 0.9 }));

describe("fuseWithRRF", () => {
  it("ranks a chunk found by both arms above one found by only one", () => {
    // 7 is 3rd by vector and 3rd lexically; 1 and 2 each lead one list only.
    const fused = fuseWithRRF(vector([1, 5, 7]), fts([2, 6, 7]), 5);

    expect(fused[0]?.chunk_id).toBe(7);
  });

  it("preserves rank order within a single list", () => {
    const fused = fuseWithRRF(vector([10, 11, 12]), [], 3);

    expect(fused.map((chunk) => chunk.chunk_id)).toEqual([10, 11, 12]);
  });

  it("sums both contributions for a chunk present in both lists", () => {
    const fused = fuseWithRRF(vector([4]), fts([4]), 1);

    // 1/(60+1) from each list.
    expect(fused[0]?.rrf_score).toBeCloseTo(2 / 61, 10);
    expect(fused).toHaveLength(1);
  });

  it("keeps the scores from whichever arm found the chunk", () => {
    const fused = fuseWithRRF(vector([4]), fts([4]), 1);

    expect(fused[0]).toMatchObject({ vector_score: 0.1, fts_rank: 0.9 });
  });

  it("zeroes the score of the arm that did not find the chunk", () => {
    const [vectorOnly] = fuseWithRRF(vector([8]), [], 1);
    const [ftsOnly] = fuseWithRRF([], fts([9]), 1);

    expect(vectorOnly).toMatchObject({ fts_rank: null });
    expect(ftsOnly).toMatchObject({ vector_score: null });
  });

  it("truncates to topK after fusing, not before", () => {
    const fused = fuseWithRRF(vector([1, 2, 3, 4, 5, 6]), fts([6, 7, 8]), 3);

    expect(fused).toHaveLength(3);
    // 6 is 6th by vector but 1st lexically, so fusion must lift it into the top 3.
    expect(fused.map((chunk) => chunk.chunk_id)).toContain(6);
  });

  it("returns an empty list when neither arm matched", () => {
    expect(fuseWithRRF([], [], 5)).toEqual([]);
  });

  it("never emits the same chunk twice", () => {
    const fused = fuseWithRRF(vector([1, 2, 3]), fts([3, 2, 1]), 10);
    const ids = fused.map((chunk) => chunk.chunk_id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
