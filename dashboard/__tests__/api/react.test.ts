import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeChain, makeSupabaseMock } from "../helpers/supabase";

vi.mock("@/lib/auth", () => ({ getUserId: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { GET, POST } from "@/app/api/insights/[id]/react/route";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const INSIGHT_ID = "insight-xyz";
const USER_ID    = "user-uuid-456";

function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/insights/${INSIGHT_ID}/react`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function makeParams() {
  return { params: Promise.resolve({ id: INSIGHT_ID }) };
}

beforeEach(() => {
  vi.mocked(getUserId).mockResolvedValue(null);
});

// ── GET ───────────────────────────────────────────────────────────────────────
describe("GET /api/insights/[id]/react", () => {
  it("returns zeroed counts with null mine when no reactions exist", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({ insight_reactions: makeChain({ data: [], error: null }) }) as never
    );

    const res = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ likes: 0, dislikes: 0, mine: null });
  });

  it("counts likes and dislikes correctly", async () => {
    const data = [
      { type: "like", user_id: "u1" },
      { type: "like", user_id: "u2" },
      { type: "dislike", user_id: "u3" },
    ];
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({ insight_reactions: makeChain({ data, error: null }) }) as never
    );

    const res = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();
    expect(body.likes).toBe(2);
    expect(body.dislikes).toBe(1);
  });

  it("sets mine to the signed-in user's reaction", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    const data = [
      { type: "dislike", user_id: USER_ID },
      { type: "like",    user_id: "other" },
    ];
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({ insight_reactions: makeChain({ data, error: null }) }) as never
    );

    const res = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();
    expect(body.mine).toBe("dislike");
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────
describe("POST /api/insights/[id]/react", () => {
  it("returns 401 when user is not signed in", async () => {
    const res = await POST(makeRequest("POST", { type: "like" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid reaction type", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseMock() as never);

    const res = await POST(makeRequest("POST", { type: "meh" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("inserts a new reaction when none exists", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    const reactionsChain = makeChain({ data: null, error: null });
    // single() → no existing reaction
    vi.mocked(reactionsChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null, error: { code: "PGRST116" },
    });
    // Second call to from("insight_reactions") for re-fetch after insert
    const refetchChain = makeChain({ data: [{ type: "like", user_id: USER_ID }], error: null });

    let callCount = 0;
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "insight_reactions") {
          callCount++;
          return callCount === 1 ? reactionsChain : refetchChain;
        }
        return makeChain();
      }),
    } as never);

    const res = await POST(makeRequest("POST", { type: "like" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.likes).toBe(1);
    expect(body.mine).toBe("like");
  });

  it("removes a reaction when the same type is posted again (toggle off)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);

    // Call 1: select + single() → existing like reaction
    const selectChain = makeChain();
    vi.mocked(selectChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: 7, type: "like" }, error: null,
    });
    // Call 2: delete + eq() — track that delete is called
    const deleteChain = makeChain();
    // Call 3: re-fetch after delete → empty reactions
    const refetchChain = makeChain({ data: [], error: null });

    const chains = [selectChain, deleteChain, refetchChain];
    let callCount = 0;
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "insight_reactions") return chains[callCount++] ?? makeChain();
        return makeChain();
      }),
    } as never);

    const res = await POST(makeRequest("POST", { type: "like" }), makeParams());
    expect(res.status).toBe(200);
    expect(vi.mocked(deleteChain.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    const body = await res.json();
    expect(body.mine).toBeNull();
  });
});
