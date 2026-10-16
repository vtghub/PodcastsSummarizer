import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/llm-waterfall", () => ({ probeLadder: vi.fn() }));

import { POST } from "@/app/api/admin/llm-providers/test/route";
import { isAdmin } from "@/lib/auth";
import { probeLadder } from "@/lib/llm-waterfall";

beforeEach(() => {
  vi.mocked(isAdmin).mockReset();
  vi.mocked(probeLadder).mockReset();
});

describe("POST /api/admin/llm-providers/test", () => {
  it("returns 403 and never calls a provider for non-admins", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await POST();

    expect(res.status).toBe(403);
    expect(probeLadder).not.toHaveBeenCalled();
  });

  it("returns the probe results for admins", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const results = [{ provider_key: "gemini", name: "gemini-3.5-flash", status: "ok", latency_ms: 1200 }];
    vi.mocked(probeLadder).mockResolvedValue(results as never);

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual(results);
    expect(typeof body.tested_at).toBe("string");
  });
});
