import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSSEQuery } from "./useSSEQuery";

function streamOf(...frames: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame) as Uint8Array<ArrayBuffer>);
      }
      controller.close();
    },
  });
}

function mockFetch(response: Partial<Response> & { body?: ReadableStream | null }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  } as Response);

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const CITATION = {
  chunks: [
    {
      chunk_id: 7,
      document_id: 1,
      filename: "handbook.pdf",
      page_number: 3,
      chunk_index: 0,
      content_preview: "Reciprocal rank fusion merges two ranked lists.",
    },
  ],
};

const META = { latency_ms: 412, retrieved_chunk_ids: [7], cache_hit: "none" as const };

describe("useSSEQuery", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the question and streams the answer into the assistant message", async () => {
    mockFetch({
      body: streamOf(
        'event: token\ndata: "Hybrid "\n\n',
        'event: token\ndata: "retrieval."\n\n',
        `event: citation\ndata: ${JSON.stringify(CITATION)}\n\n`,
        `event: meta\ndata: ${JSON.stringify(META)}\n\n`,
        "event: done\ndata: {}\n\n",
      ),
    });

    const { result } = renderHook(() => useSSEQuery());

    await act(async () => {
      await result.current.sendQuery("How does retrieval work?");
    });

    await waitFor(() => {
      expect(result.current.streamState.status).toBe("done");
    });

    const [question, answer] = result.current.messages;

    expect(question).toMatchObject({ role: "user", content: "How does retrieval work?" });
    expect(answer).toMatchObject({
      role: "assistant",
      content: "Hybrid retrieval.",
      isStreaming: false,
    });
    expect(answer?.citations).toEqual(CITATION);
    expect(answer?.meta).toEqual(META);
  });

  it("sends the collection filter in the request body", async () => {
    const fetchMock = mockFetch({ body: streamOf("event: done\ndata: {}\n\n") });

    const { result } = renderHook(() => useSSEQuery());
    await act(async () => {
      await result.current.sendQuery("scoped question", 42);
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({ query: "scoped question", collection_id: 42 });
  });

  it("surfaces a mid-stream error event as a failed message", async () => {
    mockFetch({
      body: streamOf(
        'event: token\ndata: "partial"\n\n',
        'event: error\ndata: {"message":"upstream exploded"}\n\n',
      ),
    });

    const { result } = renderHook(() => useSSEQuery());
    await act(async () => {
      await result.current.sendQuery("boom");
    });

    await waitFor(() => {
      expect(result.current.streamState).toEqual({
        status: "error",
        errorMessage: "upstream exploded",
      });
    });

    expect(result.current.messages[1]).toMatchObject({
      content: "upstream exploded",
      isError: true,
      isStreaming: false,
    });
  });

  it("reports the server's message when the request fails before the stream opens", async () => {
    mockFetch({
      ok: false,
      status: 429,
      body: null,
      json: async () => ({ error: "Query limit reached.", code: "LLM_RATE_LIMIT_EXCEEDED" }),
    });

    const { result } = renderHook(() => useSSEQuery());
    await act(async () => {
      await result.current.sendQuery("too many");
    });

    await waitFor(() => {
      expect(result.current.streamState.errorMessage).toBe("Query limit reached.");
    });
  });

  it("clearMessages empties the transcript and resets the stream state", async () => {
    mockFetch({ body: streamOf('event: token\ndata: "hi"\n\n', "event: done\ndata: {}\n\n") });

    const { result } = renderHook(() => useSSEQuery());
    await act(async () => {
      await result.current.sendQuery("hello");
    });

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.streamState).toEqual({ status: "idle", errorMessage: null });
  });
});
