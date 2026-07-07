import "@testing-library/jest-dom";
import { vi } from "vitest";

// ── Next.js server-only modules ───────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => [],
      set: vi.fn(),
    })
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

// ── Browser APIs not in happy-dom ─────────────────────────────────────────────
Object.defineProperty(window, "speechSynthesis", {
  value: { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => []) },
  writable: true,
});

Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    write: vi.fn(() => Promise.resolve()),
  },
  writable: true,
});

// ClipboardItem is not in happy-dom
if (typeof globalThis.ClipboardItem === "undefined") {
  (globalThis as unknown as Record<string, unknown>).ClipboardItem = class {
    constructor(public data: Record<string, Blob>) {}
  };
}
