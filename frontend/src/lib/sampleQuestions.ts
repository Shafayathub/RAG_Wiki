/**
 * Shown on the empty state so a first-time visitor can see a real answer
 * without uploading anything. They match the demo collection created by
 * `pnpm seed`.
 */
export const SAMPLE_QUESTIONS: readonly string[] = [
  "How does hybrid retrieval combine vector and keyword search?",
  "What is Reciprocal Rank Fusion and why use it here?",
  "How are documents chunked before they are embedded?",
  "Which caching layers does a query pass through?",
] as const;
