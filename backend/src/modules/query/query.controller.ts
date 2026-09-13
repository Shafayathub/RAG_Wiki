import type { NextFunction, Request, Response } from "express";
import { queryBodySchema } from "./query.schema";
import { streamQuery } from "./query.service";
import type { SSEEvent } from "../../types";

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Streams an answer over Server-Sent Events.
 *
 * Error handling splits at the moment the headers go out: before that the
 * normal JSON error handler runs; after it the only channel left is an SSE
 * error event, because the 200 status line is already committed.
 */
export async function handleQuery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    next(parsed.error);
    return;
  }

  const { query, collection_id, top_k } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Stops nginx and CDN edges from buffering the stream into one response.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let clientGone = false;
  const onClose = (): void => {
    clientGone = true;
  };
  req.on("close", onClose);

  try {
    for await (const event of streamQuery(query, collection_id, top_k)) {
      // Leaving the loop closes the upstream LLM stream too, so a user who
      // navigates away mid-answer stops costing tokens.
      if (clientGone) break;

      if (event.type === "token") sendSSE(res, { event: "token", data: event.token });
      else if (event.type === "citation") sendSSE(res, { event: "citation", data: event.payload });
      else sendSSE(res, { event: "meta", data: event.meta });
    }

    if (!clientGone) res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (err) {
    req.log.error("Query stream failed", err);

    if (res.headersSent) {
      sendSSE(res, {
        event: "error",
        data: { message: "The answer stream failed. Please try again." },
      });
      res.end();
      return;
    }

    next(err);
  } finally {
    req.off("close", onClose);
  }
}
