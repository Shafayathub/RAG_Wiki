import { describe, expect, it } from "vitest";
import { countTokens, splitText } from "./chunker";
import { config } from "../config/env";

// vitest.config.ts pins CHUNK_SIZE=64 and CHUNK_OVERLAP=16 for these tests.
const { chunkSize, chunkOverlap } = config;

const paragraph = (word: string, times: number) => `${word} `.repeat(times).trim();

describe("splitText", () => {
  it("keeps short text as a single chunk", () => {
    const chunks = splitText("A short paragraph about retrieval.");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("A short paragraph about retrieval.");
    expect(chunks[0]?.chunk_index).toBe(0);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitText("")).toEqual([]);
    expect(splitText("   \n\n  ")).toEqual([]);
  });

  it("never emits a chunk larger than the configured token budget", () => {
    const chunks = splitText(
      [paragraph("alpha", 80), paragraph("beta", 80), paragraph("gamma", 80)].join("\n\n"),
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(countTokens(chunk.content)).toBeLessThanOrEqual(chunkSize);
    }
  });

  it("reports a token_count that matches the content it describes", () => {
    for (const chunk of splitText(paragraph("delta", 200))) {
      expect(chunk.token_count).toBe(countTokens(chunk.content));
    }
  });

  it("numbers chunks consecutively from zero", () => {
    const chunks = splitText(paragraph("epsilon", 300));

    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it("overlaps neighbouring chunks so a fact on a boundary stays retrievable", () => {
    const sentences = Array.from(
      { length: 40 },
      (_, index) => `Sentence number ${index} carries a distinct fact.`,
    ).join(" ");

    const chunks = splitText(sentences);

    expect(chunks.length).toBeGreaterThan(1);

    const [first, second] = chunks;
    const tail = first!.content.split(/\s+/).slice(-5).join(" ");
    expect(second!.content).toContain(tail.split(" ")[0]!);
  });

  it("hard-splits a single run of text that has no separator to break on", () => {
    const chunks = splitText("x".repeat(1200));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(countTokens(chunk.content)).toBeLessThanOrEqual(chunkSize);
    }
  });

  it("terminates on pathological input rather than looping forever", () => {
    const chunks = splitText("\n\n".repeat(500) + paragraph("zeta", 100));

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(200);
  });

  it("stamps the page number onto every chunk from that page", () => {
    const chunks = splitText(paragraph("theta", 200), 7);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page_number === 7)).toBe(true);
  });

  it("defaults page_number to null when no page is given", () => {
    expect(splitText("Markdown has no pages.")[0]?.page_number).toBeNull();
  });

  it("uses a smaller overlap than the chunk size, so chunking makes progress", () => {
    expect(chunkOverlap).toBeLessThan(chunkSize);
  });
});
