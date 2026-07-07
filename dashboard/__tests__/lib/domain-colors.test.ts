import { describe, it, expect } from "vitest";
import { DOMAINS, getDomainColor } from "@/lib/domain-colors";

describe("DOMAINS", () => {
  it("contains exactly 7 entries (6 named + Other)", () => {
    expect(DOMAINS).toHaveLength(7);
  });

  it("lists Technology & AI first", () => {
    expect(DOMAINS[0]).toBe("Technology & AI");
  });

  it("contains all expected domain names", () => {
    const expected = [
      "Technology & AI",
      "Business & Startups",
      "Health & Science",
      "Finance & Investing",
      "Leadership & Productivity",
      "Society & Culture",
      "Other",
    ];
    expect(DOMAINS).toEqual(expected);
  });
});

describe("getDomainColor", () => {
  it("returns tech key tokens for Technology & AI", () => {
    const c = getDomainColor("Technology & AI");
    expect(c.bg).toContain("tech");
    expect(c.text).toContain("tech");
    expect(c.border).toContain("tech");
    expect(c.dot).toContain("tech");
  });

  it("returns biz key tokens for Business & Startups", () => {
    const c = getDomainColor("Business & Startups");
    expect(c.bg).toContain("biz");
  });

  it("falls back to oth tokens for an unknown domain", () => {
    const c = getDomainColor("Unknown Domain");
    expect(c.bg).toContain("oth");
    expect(c.text).toContain("oth");
  });

  it("returns the same fallback for empty string", () => {
    const c = getDomainColor("");
    expect(c.bg).toContain("oth");
  });

  it("all named domains produce unique keys", () => {
    const keys = DOMAINS.filter((d) => d !== "Other").map(
      (d) => getDomainColor(d).bg
    );
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
