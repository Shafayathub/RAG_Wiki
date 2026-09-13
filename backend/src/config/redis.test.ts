import { describe, expect, it } from "vitest";
import { CacheKeys } from "./redis";

describe("CacheKeys", () => {
  it("is stable for the same input", () => {
    expect(CacheKeys.query("what is rrf", 1)).toBe(CacheKeys.query("what is rrf", 1));
  });

  it("separates the three cache namespaces", () => {
    const text = "same text";

    expect(new Set([
      CacheKeys.query(text),
      CacheKeys.embedding(text),
      CacheKeys.retrieval(text),
    ]).size).toBe(3);
  });

  it("scopes a query key by collection so filters do not share answers", () => {
    expect(CacheKeys.query("q", 1)).not.toBe(CacheKeys.query("q", 2));
    expect(CacheKeys.query("q", 1)).not.toBe(CacheKeys.query("q"));
  });

  it("labels an unscoped query as 'all'", () => {
    expect(CacheKeys.query("q")).toMatch(/^query:all:/);
  });

  it("distinguishes different questions", () => {
    expect(CacheKeys.query("what is rrf")).not.toBe(CacheKeys.query("what is hnsw"));
  });

  it("produces a fixed-width hash regardless of input length", () => {
    const short = CacheKeys.embedding("a").split(":")[1]!;
    const long = CacheKeys.embedding("a".repeat(10_000)).split(":")[1]!;

    expect(short).toHaveLength(8);
    expect(long).toHaveLength(8);
  });
});
