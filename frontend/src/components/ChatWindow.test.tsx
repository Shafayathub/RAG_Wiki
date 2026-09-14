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

  it("keeps the transcript itself out of the live region while streaming", () => {
    // The transcript mutates on every animation frame, so announcing it
    // directly produces overlapping speech rather than a readable answer.
    setup([{ ...ANSWER, isStreaming: true }], true);

    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "off");
    expect(log).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Assistant is answering…")).toBeInTheDocument();
  });

  it("announces the finished answer once, when it is complete", () => {
    setup([ANSWER]);

    const status = screen.getByText(ANSWER.content, { selector: ".sr-only" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
  });

  it("returns focus to the citation button when the drawer closes", async () => {
    setup([ANSWER]);

    const trigger = screen.getByRole("button", { name: /view 1 source/i });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: /close sources panel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
