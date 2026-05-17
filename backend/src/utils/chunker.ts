import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { marked } from "marked";
import { encoding_for_model } from "tiktoken";
import { RawChunk } from "../types";
import { config } from "../config/env";

// tiktoken encoder for text-embedding-3-small (same vocabulary as gpt-4o)
const encoder = encoding_for_model("gpt-4o");

function countTokens(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Split text into overlapping chunks of at most `chunkSize` tokens.
 * Uses recursive character splitting — tries to break on paragraphs,
 * then sentences, then words before hard-cutting. This keeps semantic
 * units together far better than naive character slicing.
 */
function splitIntoChunks(
  text: string,
  pageNumber: number | null = null,
): RawChunk[] {
  const { chunkSize, chunkOverlap } = config;
  const separators = ["\n\n", "\n", ". ", " ", ""];
  const chunks: RawChunk[] = [];

  function split(str: string, separatorIndex: number): string[] {
    if (separatorIndex >= separators.length) return [str];

    const sep = separators[separatorIndex]!;
    const parts = sep ? str.split(sep) : [str];
    const results: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? `${current}${sep}${part}` : part;
      if (countTokens(candidate) <= chunkSize) {
        current = candidate;
      } else {
        if (current) results.push(current);
        // Part itself is too big — recurse with next separator
        if (countTokens(part) > chunkSize) {
          results.push(...split(part, separatorIndex + 1));
          current = "";
        } else {
          current = part;
        }
      }
    }

    if (current) results.push(current);
    return results;
  }

  const rawPieces = split(text.trim(), 0);

  // Apply overlap: each chunk starts `chunkOverlap` tokens before
  // the previous chunk ended so context isn't lost at boundaries.
  let chunkIndex = 0;
  let i = 0;

  while (i < rawPieces.length) {
    let content = rawPieces[i]!;
    let tokenCount = countTokens(content);

    // Grow the chunk by appending pieces until we hit the size limit
    let j = i + 1;
    while (j < rawPieces.length) {
      const next = rawPieces[j]!;
      const added = countTokens(next);
      if (tokenCount + added > chunkSize) break;
      content += "\n\n" + next;
      tokenCount += added;
      j++;
    }

    chunks.push({
      content: content.trim(),
      chunk_index: chunkIndex++,
      page_number: pageNumber,
      token_count: tokenCount,
    });

    // Move back by overlap amount so the next chunk shares context
    const overlapTokenTarget = chunkOverlap;
    let overlapTokens = 0;
    let backtrack = j - 1;

    while (backtrack > i && overlapTokens < overlapTokenTarget) {
      overlapTokens += countTokens(rawPieces[backtrack]!);
      backtrack--;
    }

    i = Math.max(i + 1, backtrack + 1);
  }

  return chunks;
}

/**
 * Parse a PDF and return chunks per page.
 * Chunking per-page means page_number metadata is accurate —
 * crucial for citations pointing to exact source pages.
 */
async function chunkPdf(filePath: string): Promise<RawChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  // pdf-parse gives us all text merged — we re-split on form-feed
  // characters (\f) which most PDFs use as page separators.
  const pages = result.text.split("\f").filter((p: any) => p.trim().length > 0);

  const allChunks: RawChunk[] = [];
  let globalIndex = 0;

  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageChunks = splitIntoChunks(pages[pageNum]!, pageNum + 1);
    for (const chunk of pageChunks) {
      allChunks.push({ ...chunk, chunk_index: globalIndex++ });
    }
  }

  return allChunks;
}

/**
 * Parse Markdown: strip HTML tags from the rendered output,
 * then chunk as plain text. No page numbers for markdown.
 */
async function chunkMarkdown(filePath: string): Promise<RawChunk[]> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const html = await marked(raw);
  // Strip HTML tags — we want plain text for embedding
  const plainText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return splitIntoChunks(plainText, null);
}

export async function chunkFile(
  filePath: string,
  fileType: "pdf" | "markdown",
): Promise<RawChunk[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (fileType === "pdf" || ext === ".pdf") {
    return chunkPdf(filePath);
  }

  if (fileType === "markdown" || ext === ".md" || ext === ".markdown") {
    return chunkMarkdown(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
