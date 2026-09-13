import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CitationDrawer } from "./CitationDrawer";
import type { CitationChunk } from "../types";

const CHUNKS: CitationChunk[] = [
  {
    chunk_id: 1,
    document_id: 1,
    filename: "handbook.pdf",
    page_number: 12,
    chunk_index: 0,
    content_preview: "Vector search finds semantically similar passages.",
  },
  {
    chunk_id: 2,
    document_id: 1,
    filename: "notes.md",
    page_number: null,
    chunk_index: 4,
    content_preview: "Markdown has no pages, so the chunk index is shown.",
  },
];

describe("CitationDrawer", () => {
  it("exposes the panel as a labelled dialog", () => {
    render(<CitationDrawer chunks={CHUNKS} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /2 cited/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources (2)" })).toBeInTheDocument();
  });

  it("cites a page number for PDFs and a chunk index for page-less sources", () => {
    render(<CitationDrawer chunks={CHUNKS} onClose={vi.fn()} />);

    expect(screen.getByText("Page 12")).toBeInTheDocument();
    expect(screen.getByText("Chunk 5")).toBeInTheDocument();
  });

  it("moves focus to the close button so the drawer is keyboard-operable", () => {
    render(<CitationDrawer chunks={CHUNKS} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /close sources/i })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CitationDrawer chunks={CHUNKS} onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the close button is activated", async () => {
    const onClose = vi.fn();
    render(<CitationDrawer chunks={CHUNKS} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /close sources/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
