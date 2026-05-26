import { ScoredChunk } from "../types";

export interface BuiltContext {
  prompt:   string;
  chunkMap: Map<string, ScoredChunk>; // sourceId → chunk
}

/**
 * Builds the system + user prompt injected into the LLM.
 *
 * Each chunk is labelled [SOURCE:chunk_id] so the LLM can
 * reference it in its answer. The controller maps those IDs
 * back to real document metadata for the citation payload.
 */
export function buildContext(
  query:  string,
  chunks: ScoredChunk[],
): BuiltContext {
  // Map source id → chunk for fast lookup when parsing citations
  const chunkMap = new Map<string, ScoredChunk>();

  const contextBlocks = chunks.map((chunk) => {
    const sourceId = `chunk_${chunk.chunk_id}`;
    chunkMap.set(sourceId, chunk);

    return [
      `[SOURCE:${sourceId}]`,
      `File: ${chunk.filename}${chunk.page_number ? ` (page ${chunk.page_number})` : ""}`,
      chunk.content,
      `[/SOURCE:${sourceId}]`,
    ].join("\n");
  });

  const systemPrompt = `You are a precise research assistant. Answer questions using ONLY the provided source documents.

Rules:
- Cite every claim using [SOURCE:chunk_id] tags exactly as they appear in the context
- If the answer is not in the sources, say "I cannot find this in the provided documents"
- Do not speculate or add information beyond what the sources contain
- Be concise and direct

Sources:
${contextBlocks.join("\n\n")}`;

  const userPrompt = `Question: ${query}`;

  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  return { prompt, chunkMap };
}

/**
 * Parses [SOURCE:chunk_id] references from the LLM's answer.
 * Returns unique source ids in the order they first appeared.
 */
export function extractCitedSources(answer: string): string[] {
  const matches = answer.matchAll(/\[SOURCE:(chunk_\d+)\]/g);
  const seen    = new Set<string>();
  const ordered: string[] = [];

  for (const match of matches) {
    const id = match[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  return ordered;
}