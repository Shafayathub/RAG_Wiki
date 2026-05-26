import { Request, Response, NextFunction } from "express";
import { queryBodySchema } from "./query.schema";
import { runQueryPipeline, streamQueryPipeline } from "./query.service";
import { SSEEvent } from "../../types";
import { redis, CacheKeys } from "../../config/redis";

// ─────────────────────────────────────────────────────────────────────────────
//  SSE helper — writes a single SSE-formatted message to the response
//
//  SSE wire format:
//    event: <eventName>\n
//    data: <json>\n
//    \n
// ─────────────────────────────────────────────────────────────────────────────

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  handleQuery
//  Decides between two paths:
//    - Query cache HIT  → replay cached answer token-by-token (simulated stream)
//    - Query cache MISS → live stream from OpenRouter token-by-token
//
//  Both paths produce identical SSE output on the client side —
//  the frontend never knows whether it was cached or live.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleQuery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // ── Validate request body ─────────────────────────────────────────────────
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    next(parsed.error);
    return;
  }

  const { query, collection_id, top_k } = parsed.data;

  // ── Set SSE headers ───────────────────────────────────────────────────────
  // These must be set before any write() call.
  // Cache-Control: no-cache is required for SSE — prevents buffering.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disables nginx buffering for SSE
  res.flushHeaders();

  // Clean up if client disconnects mid-stream
  const onClose = (): void => {
    res.end();
  };
  req.on("close", onClose);

  try {
    // ── Path A: query cache HIT ─────────────────────────────────────────────
    // Check cache first — if hit, simulate streaming by splitting
    // the cached answer into words and yielding them with a small delay.
    // This gives the same UX as a live stream without the LLM cost.

    const queryCacheKey = CacheKeys.query(query, collection_id);
    const cachedString = await redis.get(queryCacheKey);
    if (cachedString) {
      const cached = JSON.parse(cachedString) as {
        answer: string;
        citations: import("../../types").CitationPayload;
        meta: import("../../types").QueryMetadata;
      };

      // Simulate streaming: emit word by word with 20ms gaps
      const words = cached.answer.split(" ");
      for (const word of words) {
        sendSSE(res, { event: "token", data: word + " " });
        await new Promise((r) => setTimeout(r, 20));
      }

      sendSSE(res, {
        event: "citation",
        data: cached.citations,
      });

      sendSSE(res, {
        event: "meta",
        data: { ...cached.meta, cache_hit: "query" },
      });

      res.write("event: done\ndata: {}\n\n");
      res.end();
      return;
    }

    // ── Path B: cache MISS — live stream ────────────────────────────────────
    const generator = streamQueryPipeline(query, collection_id, top_k);

    for await (const chunk of generator) {
      if (chunk.type === "token") {
        sendSSE(res, { event: "token", data: chunk.token });
      } else if (chunk.type === "citation") {
        sendSSE(res, { event: "citation", data: chunk.payload });
      } else if (chunk.type === "meta") {
        sendSSE(res, { event: "meta", data: chunk.meta });
      }
    }

    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (err) {
    // If headers already sent (mid-stream error), send SSE error event
    if (res.headersSent) {
      sendSSE(res, {
        event: "error",
        data: { message: err instanceof Error ? err.message : "Stream error" },
      });
      res.end();
    } else {
      next(err);
    }
  } finally {
    req.off("close", onClose);
  }
}