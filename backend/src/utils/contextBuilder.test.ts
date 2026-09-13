import { describe, expect, it } from "vitest";
import { buildContext, extractCitedSources } from "./contextBuilder";
import type { ScoredChunk } from "../types";

function chunk(overrides: Partial<ScoredChunk> = {}): ScoredChunk {
  return {
    chunk_id: 1,
    document_id: 1,
    filename: "handbook.pdf",
    content: "Reciprocal rank fusion merges two ranked lists.",
    page_number: 4,
    chunk_index: 0,
    rrf_score: 0.5,
    vector_score: 0.1,
    fts_rank: 0.2,
    ...overrides,
  };
}

describe("buildContext", () => {
  it("tags every chunk with a source id the model can cite", () => {
    const { prompt } = buildContext("What is RRF?", [
      chunk({ chunk_id: 11 }),
      chunk({ chunk_id: 12 }),
    ]);

    expect(prompt).toContain("[SOURCE:chunk_11]");
    expect(prompt).toContain("[SOURCE:chunk_12]");
  });

  it("maps each source id back to the chunk it came from", () => {
    const { chunkMap } = buildContext("q", [chunk({ chunk_id: 11 }), chunk({ chunk_id: 12 })]);

    expect([...chunkMap.keys()]).toEqual(["chunk_11", "chunk_12"]);
    expect(chunkMap.get("chunk_11")?.chunk_id).toBe(11);
  });

  it("includes the page number so a citation can point at it", () => {
    const { prompt } = buildContext("q", [chunk({ filename: "report.pdf", page_number: 7 })]);

    expect(prompt).toContain("report.pdf (page 7)");
  });

  it("omits the page for sources that have none", () => {
    const { prompt } = buildContext("q", [chunk({ filename: "notes.md", page_number: null })]);

    expect(prompt).toContain("File: notes.md");
    expect(prompt).not.toContain("(page");
  });

  it("carries the question and the grounding instruction into the prompt", () => {
    const { prompt } = buildContext("What is RRF?", [chunk()]);

    expect(prompt).toContain("Question: What is RRF?");
    expect(prompt).toContain("ONLY the provided source documents");
  });
});

describe("extractCitedSources", () => {
  it("returns cited ids in first-appearance order", () => {
    const answer = "First [SOURCE:chunk_5] then [SOURCE:chunk_2].";

    expect(extractCitedSources(answer)).toEqual(["chunk_5", "chunk_2"]);
  });

  it("deduplicates an id cited more than once", () => {
    const answer = "[SOURCE:chunk_3] and again [SOURCE:chunk_3].";

    expect(extractCitedSources(answer)).toEqual(["chunk_3"]);
  });

  it("returns nothing when the answer cites nothing", () => {
    expect(extractCitedSources("I cannot find this in the provided documents.")).toEqual([]);
  });

  it("ignores malformed source tags", () => {
    expect(extractCitedSources("[SOURCE:chunk_] [SOURCE:doc_1] [SOURCE:chunk_9]")).toEqual([
      "chunk_9",
    ]);
  });
});
