import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatWindow } from "./ChatWindow";
import { SAMPLE_QUESTIONS } from "../lib/sampleQuestions";
import type { ChatMessage } from "../types";

const ANSWER: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "Hybrid retrieval fuses two ranked lists.",
  citations: {
    chunks: [
      {
        chunk_id: 9,
        document_id: 1,
        filename: "architecture.md",
        page_number: null,
        chunk_index: 2,
        content_preview: "RRF sums 1/(k + rank) across both lists.",
      },
    ],
  },
  meta: { latency_ms: 320, retrieved_chunk_ids: [9], cache_hit: "none" },
  isStreaming: false,
};

function setup(messages: ChatMessage[], isStreaming = false) {
  const props = {
    messages,
    isStreaming,
    onClear: vi.fn(),
    onAskSample: vi.fn(),
  };

  render(<ChatWindow {...props} />);
  return props;
}

describe("ChatWindow", () => {
  it("offers sample questions when the transcript is empty", () => {
    setup([]);

    for (const question of SAMPLE_QUESTIONS) {
      expect(screen.getByRole("button", { name: question })).toBeInTheDocument();
    }
  });

  it("asks the sample question that was clicked", async () => {
    const { onAskSample } = setup([]);

    await userEvent.click(screen.getByRole("button", { name: SAMPLE_QUESTIONS[0] }));

    expect(onAskSample).toHaveBeenCalledWith(SAMPLE_QUESTIONS[0]);
  });

  it("announces the transcript as a live region so answers are read aloud", () => {
    setup([ANSWER]);

    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
  });

  it("opens the sources drawer from the citation button", async () => {
    setup([ANSWER]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /view 1 source/i }));

    expect(screen.getByRole("dialog", { name: /1 cited/i })).toBeInTheDocument();
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
  });

  it("shows the cached badge only when the answer came from cache", () => {
    const { unmount } = render(
      <ChatWindow messages={[ANSWER]} isStreaming={false} onClear={vi.fn()} onAskSample={vi.fn()} />,
    );
    expect(screen.queryByText("cached")).not.toBeInTheDocument();
    unmount();

    setup([{ ...ANSWER, meta: { ...ANSWER.meta!, cache_hit: "query" } }]);
    expect(screen.getByText("cached")).toBeInTheDocument();
  });

  it("hides the clear button while an answer is still streaming", () => {
    setup([{ ...ANSWER, isStreaming: true }], true);

    expect(screen.queryByRole("button", { name: /clear chat/i })).not.toBeInTheDocument();
  });
});
