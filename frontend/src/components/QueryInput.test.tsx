import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryInput } from "./QueryInput";
import type { CollectionSummary } from "../types";

const COLLECTIONS: CollectionSummary[] = [
  {
    id: 3,
    name: "Q4 Reports",
    created_at: "2026-01-01T00:00:00.000Z",
    document_count: 2,
    chunk_count: 120,
  },
];

function setup(overrides: Partial<React.ComponentProps<typeof QueryInput>> = {}) {
  const props = {
    collections: COLLECTIONS,
    isLoadingCollections: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    isStreaming: false,
    ...overrides,
  };

  render(<QueryInput {...props} />);
  return props;
}

describe("QueryInput", () => {
  it("sends the trimmed question on Enter and clears the box", async () => {
    const { onSend } = setup();
    const textarea = screen.getByRole("textbox", { name: /ask a question/i });

    await userEvent.type(textarea, "  What is RRF?  {Enter}");

    expect(onSend).toHaveBeenCalledWith("What is RRF?", undefined);
    expect(textarea).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const { onSend } = setup();
    const textarea = screen.getByRole("textbox", { name: /ask a question/i });

    await userEvent.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("line one\nline two");
  });

  it("passes the selected collection id with the question", async () => {
    const { onSend } = setup();

    await userEvent.selectOptions(screen.getByLabelText(/scope to/i), "3");
    await userEvent.type(
      screen.getByRole("textbox", { name: /ask a question/i }),
      "scoped{Enter}",
    );

    expect(onSend).toHaveBeenCalledWith("scoped", 3);
  });

  it("labels each collection with its document count", () => {
    setup();

    expect(screen.getByRole("option", { name: "Q4 Reports (2 docs)" })).toBeInTheDocument();
  });

  it("refuses to send an empty or whitespace-only question", async () => {
    const { onSend } = setup();

    await userEvent.type(screen.getByRole("textbox", { name: /ask a question/i }), "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("swaps Send for Stop while an answer is streaming", async () => {
    const { onStop } = setup({ isStreaming: true });

    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onStop).toHaveBeenCalledOnce();
  });
});
