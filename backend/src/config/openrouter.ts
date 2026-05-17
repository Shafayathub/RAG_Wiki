import OpenAI from "openai";
import { config } from "./env";

export const llm = new OpenAI({
  apiKey:  config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3001",  // required by OpenRouter
    "X-Title":      "RAG Wiki",
  },
});