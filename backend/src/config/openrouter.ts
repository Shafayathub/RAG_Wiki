import OpenAI from "openai";
import { config } from "./env";

/**
 * OpenRouter uses the OpenAI wire format. The referer and title headers are
 * how it attributes usage on the public leaderboard, so they must point at
 * the real deployment rather than a developer's localhost.
 */
export const llm = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 60_000,
  maxRetries: 2,
  defaultHeaders: {
    "HTTP-Referer": config.appUrl,
    "X-Title": "RAG Wiki",
  },
});
