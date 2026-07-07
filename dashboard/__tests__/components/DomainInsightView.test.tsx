import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { makeInsight } from "../helpers/insight";

// Mock InsightCard to avoid rendering its full complexity
vi.mock("@/components/InsightCard", () => ({
  default: ({ insight }: { insight: { id: string } }) => (
    <div data-testid={`card-${insight.id}`} />
  ),
}));

import DomainInsightView from "@/components/DomainInsightView";

function buildByDomain(domains: string[]) {
  return Object.fromEntries(
    domains.map((d, i) => [d, [makeInsight({ id: `ins-${i}`, domain: d })]])
  );
}

beforeEach(() => {
  // Reset URL to plain /dashboard with no params
  vi.stubGlobal("location", { search: "", hash: "" });
});

describe("DomainInsightView — initial domain selection", () => {
  it("selects the first domain with content by default", () => {
    const byDomain = buildByDomain(["Technology & AI", "Business & Startups"]);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    const techTab = screen.getByRole("button", { name: /Technology & AI/i });
    const bizTab  = screen.getByRole("button", { name: /Business & Startups/i });

    // "active" tab has aria-current or a different style; we check the card is rendered
    expect(screen.getByTestId("card-ins-0")).toBeInTheDocument();
    expect(screen.queryByTestId("card-ins-1")).not.toBeInTheDocument();
  });

  it("does NOT default to Business & Startups when Technology & AI comes first", () => {
    const byDomain = buildByDomain(["Technology & AI", "Business & Startups"]);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    // Only the Technology & AI card should be visible
    expect(screen.getByTestId("card-ins-0")).toBeInTheDocument();
    expect(screen.queryByTestId("card-ins-1")).not.toBeInTheDocument();
  });

  it("selects first available domain even when Business & Startups is the only option", () => {
    const byDomain = buildByDomain(["Business & Startups"]);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    expect(screen.getByTestId("card-ins-0")).toBeInTheDocument();
  });

  it("applies the ?domain= URL param to override the initial selection", () => {
    vi.stubGlobal("location", {
      search: "?domain=Business+%26+Startups",
      hash: "",
    });
    const byDomain = buildByDomain(["Technology & AI", "Business & Startups"]);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    // After mount effect runs, Business & Startups card should be shown
    expect(screen.getByTestId("card-ins-1")).toBeInTheDocument();
  });
});

describe("DomainInsightView — tab switching", () => {
  it("shows the correct cards when a different tab is clicked", () => {
    const byDomain = buildByDomain(["Technology & AI", "Business & Startups"]);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    // Initially Technology & AI
    expect(screen.getByTestId("card-ins-0")).toBeInTheDocument();

    // Click Business & Startups tab
    const bizTab = screen.getByRole("button", { name: /Business & Startups/i });
    fireEvent.click(bizTab);

    expect(screen.getByTestId("card-ins-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-ins-0")).not.toBeInTheDocument();
  });

  it("renders a tab button for each domain", () => {
    const domains = ["Technology & AI", "Health & Science", "Society & Culture"];
    const byDomain = buildByDomain(domains);
    render(<DomainInsightView byDomain={byDomain} isAuthed={false} />);

    domains.forEach((d) => {
      expect(screen.getByRole("button", { name: new RegExp(d.replace("&", "\\&"), "i") })).toBeInTheDocument();
    });
  });
});
