import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeChain, makeSupabaseMock } from "../helpers/supabase";

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ getUserId: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { GET } from "@/app/api/insights/[id]/engagement/route";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const INSIGHT_ID = "insight-abc";
const USER_ID = "user-uuid-123";

function makeRequest(search = "") {
  return new Request(`http://localhost/api/insights/${INSIGHT_ID}/engagement${search}`);
}
function makeParams() {
  return { params: Promise.resolve({ id: INSIGHT_ID }) };
}

beforeEach(() => {
  vi.mocked(getUserId).mockResolvedValue(null);
});

describe("GET /api/insights/[id]/engagement", () => {
  it("returns zero counts when tables are empty", async () => {
    const views    = makeChain({ data: null, error: null, count: 0 });
    const reactions = makeChain({ data: [], error: null });
    const comments = makeChain({ data: null, error: null, count: 0 });

    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({
        insight_views: views,
        insight_reactions: reactions,
        insight_comments: comments,
      }) as never
    );

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ views: 0, likes: 0, dislikes: 0, mine: null, commentCount: 0 });
  });

  it("tallies likes and dislikes from reaction rows", async () => {
    const reactionData = [
      { type: "like",    user_id: "u1" },
      { type: "like",    user_id: "u2" },
      { type: "dislike", user_id: "u3" },
    ];
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({
        insight_views:    makeChain({ count: 5, error: null }),
        insight_reactions: makeChain({ data: reactionData, error: null }),
        insight_comments:  makeChain({ count: 2, error: null }),
      }) as never
    );

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.likes).toBe(2);
    expect(body.dislikes).toBe(1);
    expect(body.views).toBe(5);
    expect(body.commentCount).toBe(2);
  });

  it("sets mine to the current user's reaction type", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    const reactionData = [
      { type: "like", user_id: USER_ID },
      { type: "like", user_id: "other-user" },
    ];
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({
        insight_views:    makeChain({ count: 1, error: null }),
        insight_reactions: makeChain({ data: reactionData, error: null }),
        insight_comments:  makeChain({ count: 0, error: null }),
      }) as never
    );

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.mine).toBe("like");
  });

  describe("?view=1 — view recording", () => {
    it("inserts an anonymous row when user is not signed in", async () => {
      const viewsChain = makeChain({ count: 1, error: null });
      vi.mocked(getSupabaseClient).mockReturnValue(
        makeSupabaseMock({
          insight_views:    viewsChain,
          insight_reactions: makeChain({ data: [], error: null }),
          insight_comments:  makeChain({ count: 0, error: null }),
        }) as never
      );

      await GET(makeRequest("?view=1"), makeParams());

      // Anonymous path: insert called without user_id check
      expect(vi.mocked(viewsChain.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        { insight_id: INSIGHT_ID }
      );
    });

    it("checks for existing row before inserting for authenticated user", async () => {
      vi.mocked(getUserId).mockResolvedValue(USER_ID);

      const viewsChain = makeChain({ count: 1, error: null });
      // maybeSingle returns null → no existing row → insert should be called
      vi.mocked(viewsChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null, error: null,
      });

      vi.mocked(getSupabaseClient).mockReturnValue(
        makeSupabaseMock({
          insight_views:    viewsChain,
          insight_reactions: makeChain({ data: [], error: null }),
          insight_comments:  makeChain({ count: 0, error: null }),
        }) as never
      );

      await GET(makeRequest("?view=1"), makeParams());

      expect(vi.mocked(viewsChain.maybeSingle as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect(vi.mocked(viewsChain.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        { insight_id: INSIGHT_ID, user_id: USER_ID }
      );
    });

    it("skips insert when authenticated user already has a view row", async () => {
      vi.mocked(getUserId).mockResolvedValue(USER_ID);

      const viewsChain = makeChain({ count: 3, error: null });
      // maybeSingle returns existing row → insert must NOT be called
      vi.mocked(viewsChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: 99 }, error: null,
      });

      vi.mocked(getSupabaseClient).mockReturnValue(
        makeSupabaseMock({
          insight_views:    viewsChain,
          insight_reactions: makeChain({ data: [], error: null }),
          insight_comments:  makeChain({ count: 0, error: null }),
        }) as never
      );

      await GET(makeRequest("?view=1"), makeParams());

      expect(vi.mocked(viewsChain.insert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("does NOT record a view without ?view=1", async () => {
      const viewsChain = makeChain({ count: 0, error: null });
      vi.mocked(getSupabaseClient).mockReturnValue(
        makeSupabaseMock({
          insight_views:    viewsChain,
          insight_reactions: makeChain({ data: [], error: null }),
          insight_comments:  makeChain({ count: 0, error: null }),
        }) as never
      );

      await GET(makeRequest(), makeParams());

      expect(vi.mocked(viewsChain.insert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });
  });
});
