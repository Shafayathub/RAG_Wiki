import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom implements neither of these, and both are used for layout decisions
// on mount, so every component test would otherwise throw before rendering.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

globalThis.requestAnimationFrame ??= ((callback: FrameRequestCallback) =>
  setTimeout(() => callback(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;

globalThis.cancelAnimationFrame ??= ((handle: number) =>
  clearTimeout(handle)) as typeof cancelAnimationFrame;
