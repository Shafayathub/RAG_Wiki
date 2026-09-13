import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { marked } from "marked";
import { getEncoding, type Tiktoken } from "js-tiktoken";
import { AppError, type RawChunk } from "../types";
import { config } from "../config/env";

/**
 * js-tiktoken over the WASM `tiktoken` build: the WASM module needs a manual
 * `free()` to avoid leaking across serverless invocations, and bundling it
 * into a Vercel function is fragile. Pure JS costs a little speed and removes
 * both problems.
 */
let encoder: Tiktoken | null = null;

function tokenizer(): Tiktoken {
  encoder ??= getEncoding("o200k_base");
  return encoder;
}

export function countTokens(text: string): number {
  return tokenizer().encode(text).length;
}

interface Piece {
  text: string;
  tokens: number;
}

/** Ordered coarse → fine. The empty string is the hard-cut fallback. */
const SEPARATORS = ["\n\n", "\n", ". ", " ", ""] as const;

/**
 * Last resort for a run of text with no separator left to split on (a long
 * URL, a table row, CJK prose). Cutting on token boundaries guarantees every
 * piece fits the budget, which no character heuristic can promise.
 */
function hardSplit(text: string, limit: number): Piece[] {
  const enc = tokenizer();
  const tokens = enc.encode(text);
  const pieces: Piece[] = [];

  for (let i = 0; i < tokens.length; i += limit) {
    const slice = tokens.slice(i, i + limit);
    pieces.push({ text: enc.decode(slice), tokens: slice.length });
  }

  return pieces;
}

/**
 * Recursive character splitting: break on paragraphs first, then lines,
 * sentences and words, so a chunk boundary lands where a human would put one.
 *
 * Each piece keeps the separator that followed it, which means concatenating
 * pieces reproduces the source text byte for byte. Rejoining with a separator
 * of our own choosing would both corrupt the text and inflate its token count,
 * because a token count is not additive across an arbitrary join.
 *
 * Token counts are computed once per piece and summed while packing, rather
 * than re-encoding a growing candidate on every step — that is the difference
 * between quadratic and linear work on a long page.
 */
function splitIntoPieces(text: string, separatorIndex = 0): Piece[] {
  const { chunkSize } = config;
  if (text.length === 0) return [];

  const tokens = countTokens(text);
  if (tokens <= chunkSize) return [{ text, tokens }];

  const separator = SEPARATORS[separatorIndex];
  if (separator === undefined || separator === "") return hardSplit(text, chunkSize);

  const parts = text.split(separator);
  const pieces: Piece[] = [];

  parts.forEach((part, index) => {
    const withSeparator = index < parts.length - 1 ? part + separator : part;
    if (withSeparator.length === 0) return;

    // A run of pure whitespace carries no content but does carry formatting.
    // Fold it into the previous piece instead of emitting a contentless one.
    if (withSeparator.trim().length === 0) {
      const previous = pieces[pieces.length - 1];
      if (previous) {
        const merged = previous.text + withSeparator;
        const mergedTokens = countTokens(merged);

        // Folding must not push the piece past the budget: packIntoChunks is
        // then forced to emit it alone and oversized to make progress.
        if (mergedTokens <= chunkSize) {
          previous.text = merged;
          previous.tokens = mergedTokens;
        } else {
          pieces.pop();
          pieces.push(...hardSplit(merged, chunkSize));
        }
      }
      return;
    }

    pieces.push(...splitIntoPieces(withSeparator, separatorIndex + 1));
  });

  return pieces;
}

/**
 * Pack pieces into chunks up to `chunkSize` tokens, then step back far enough
 * to repeat roughly `chunkOverlap` tokens at the start of the next chunk.
 * The overlap is what stops a fact that straddles a boundary from becoming
 * unretrievable in both neighbours.
 */
function packIntoChunks(pieces: Piece[], pageNumber: number | null): RawChunk[] {
  const { chunkSize, chunkOverlap } = config;
  const chunks: RawChunk[] = [];

  let start = 0;
  let chunkIndex = 0;

  while (start < pieces.length) {
    let end = start;
    let budget = 0;

    while (end < pieces.length) {
      const next = pieces[end]!;
      // `end === start` forces at least one piece in, even if it is oversized,
      // so the loop can never stall.
      if (end > start && budget + next.tokens > chunkSize) break;
      budget += next.tokens;
      end++;
    }

    const content = pieces
      .slice(start, end)
      .map((piece) => piece.text)
      .join("")
      .trim();

    if (content.length > 0) {
      chunks.push({
        content,
        chunk_index: chunkIndex++,
        page_number: pageNumber,
        // Re-encode the assembled chunk: the summed estimate drives packing,
        // but what gets stored has to be the real count.
        token_count: countTokens(content),
      });
    }

    if (end >= pieces.length) break;

    let rewind = end;
    let overlap = 0;
    // Stop at start + 1 so the window always advances by at least one piece.
    while (rewind > start + 1 && overlap + pieces[rewind - 1]!.tokens <= chunkOverlap) {
      rewind--;
      overlap += pieces[rewind]!.tokens;
    }

    start = rewind;
  }

  return chunks;
}

export function splitText(text: string, pageNumber: number | null = null): RawChunk[] {
  return packIntoChunks(splitIntoPieces(text.trim()), pageNumber);
}

/**
 * Chunk per page so `page_number` stays accurate — a citation that names the
 * wrong page is worse than no citation at all.
 */
async function chunkPdf(filePath: string): Promise<RawChunk[]> {
  const parser = new PDFParse({ data: await readFile(filePath) });

  let text: string;
  try {
    ({ text } = await parser.getText());
  } finally {
    await parser.destroy();
  }

  // Most producers emit a form feed between pages; if none is present the
  // document is treated as a single page rather than mis-numbered.
  const pages = text.split("\f").filter((page) => page.trim().length > 0);

  const chunks: RawChunk[] = [];
  let globalIndex = 0;

  pages.forEach((page, offset) => {
    for (const chunk of splitText(page, offset + 1)) {
      chunks.push({ ...chunk, chunk_index: globalIndex++ });
    }
  });

  return chunks;
}

async function chunkMarkdown(filePath: string): Promise<RawChunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const html = await marked(raw);
  const plainText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return splitText(plainText, null);
}

export async function chunkFile(
  filePath: string,
  fileType: "pdf" | "markdown",
): Promise<RawChunk[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (fileType === "pdf" || ext === ".pdf") return chunkPdf(filePath);
  if (fileType === "markdown" || ext === ".md" || ext === ".markdown") {
    return chunkMarkdown(filePath);
  }

  throw new AppError(400, `Unsupported file type: ${ext}`, "UNSUPPORTED_FILE_TYPE");
}
