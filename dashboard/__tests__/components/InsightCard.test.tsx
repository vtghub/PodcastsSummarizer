import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { makeInsight } from "../helpers/insight";

// Mock contexts and hooks so we don't need real providers
vi.mock("@/contexts/TTSContext", () => ({
  useTTS: () => ({ enabled: false, toggle: vi.fn() }),
}));
vi.mock("@/hooks/useSpeech", () => ({
  useSpeech: () => ({ speaking: false, speak: vi.fn() }),
}));

// Stable fetch mock — resolves with engagement data
const engagementData = { views: 42, likes: 5, dislikes: 1, mine: null, commentCount: 3 };
const fetchMock = vi.fn(() =>
  Promise.resolve({ json: () => Promise.resolve(engagementData) })
);
vi.stubGlobal("fetch", fetchMock);

vi.stubGlobal("location", { origin: "http://localhost", search: "", hash: "" });

import InsightCard from "@/components/InsightCard";
import { getDomainColor } from "@/lib/domain-colors";

const domainColor = getDomainColor("Technology & AI");

/** Renders the card and waits for the async useEffect fetch to settle. */
async function renderCard(overrides = {}, isAuthed = false) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <InsightCard insight={makeInsight(overrides)} domainColor={domainColor} isAuthed={isAuthed} />
    );
  });
  return result!;
}

beforeEach(() => {
  vi.mocked(fetchMock).mockClear();
  vi.mocked(navigator.clipboard.write as ReturnType<typeof vi.fn>).mockClear();
  vi.mocked(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear();
  // Reset to resolving mock after each test
  vi.mocked(fetchMock).mockImplementation(() =>
    Promise.resolve({ json: () => Promise.resolve(engagementData) })
  );
});

// ── Rendering ─────────────────────────────────────────────────────────────────
describe("InsightCard — rendering", () => {
  it("renders the podcast source name", async () => {
    await renderCard();
    expect(screen.getByText("Big Tech Podcast")).toBeInTheDocument();
  });

  it("renders the episode title", async () => {
    await renderCard();
    expect(screen.getByText("AI Takes Over Everything")).toBeInTheDocument();
  });

  it("renders the summary", async () => {
    await renderCard();
    expect(screen.getByText("A look at the latest AI trends.")).toBeInTheDocument();
  });

  it("renders only the first 3 key points and shows an overflow hint", async () => {
    await renderCard({ key_points: ["P1", "P2", "P3", "P4", "P5"] });
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("P3")).toBeInTheDocument();
    expect(screen.queryByText("P4")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more…")).toBeInTheDocument();
  });

  it("renders tags as chips", async () => {
    await renderCard();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Technology")).toBeInTheDocument();
  });
});

// ── Engagement counts ─────────────────────────────────────────────────────────
describe("InsightCard — engagement counts", () => {
  it("calls the engagement API on mount", async () => {
    await renderCard();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/insights/insight-1/engagement?view=1")
    );
  });

  it("shows engagement counts after fetch resolves", async () => {
    await renderCard();
    // View count should now show 42
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows — placeholder before the fetch resolves", async () => {
    // Block the fetch so counts stay null
    vi.mocked(fetchMock).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      render(<InsightCard insight={makeInsight()} domainColor={domainColor} isAuthed={false} />);
    });
    // The — span (opacity 0.35) should be present — check via opacity style
    const placeholder = document.querySelector("[style*='opacity']");
    expect(placeholder).toBeInTheDocument();
  });
});

// ── Copy button ───────────────────────────────────────────────────────────────
describe("InsightCard — copy button", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it("renders the copy button", async () => {
    await renderCard();
    expect(screen.getByTitle("Copy insight")).toBeInTheDocument();
  });

  it("calls clipboard.write with a ClipboardItem on click", async () => {
    vi.mocked(fetchMock).mockImplementation(() =>
      Promise.resolve({ json: () => Promise.resolve(engagementData) })
    );
    await act(async () => {
      render(<InsightCard insight={makeInsight()} domainColor={domainColor} isAuthed={false} />);
      await Promise.resolve(); // flush microtasks
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy insight"));
      await Promise.resolve();
    });
    expect(navigator.clipboard.write).toHaveBeenCalled();
  });

  it("falls back to writeText when ClipboardItem write throws", async () => {
    vi.mocked(navigator.clipboard.write as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("not supported")
    );
    vi.mocked(fetchMock).mockImplementation(() =>
      Promise.resolve({ json: () => Promise.resolve(engagementData) })
    );
    await act(async () => {
      render(<InsightCard insight={makeInsight()} domainColor={domainColor} isAuthed={false} />);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy insight"));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

// ── Engagement interactions ───────────────────────────────────────────────────
describe("InsightCard — engagement interactions", () => {
  it("both like and dislike buttons show 'Sign in to react' when not authenticated", async () => {
    await renderCard();
    const signInButtons = screen.getAllByTitle("Sign in to react");
    expect(signInButtons).toHaveLength(2); // like + dislike
  });

  it("like button shows 'Like' title when authenticated", async () => {
    await renderCard({}, true);
    expect(screen.getByTitle("Like")).toBeInTheDocument();
  });

  it("expand button reveals quotes and action items", async () => {
    await renderCard();
    expect(screen.queryByText(/The future is already here/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Show quotes & actions"));
    });

    expect(screen.getByText(/The future is already here/)).toBeInTheDocument();
    expect(screen.getByText(/Experiment with AI tools/)).toBeInTheDocument();
  });

  it("expand button label toggles to 'Show less' when expanded", async () => {
    await renderCard();
    await act(async () => {
      fireEvent.click(screen.getByText("Show quotes & actions"));
    });
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });
});
