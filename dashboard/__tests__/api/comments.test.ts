import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeChain, makeSupabaseMock } from "../helpers/supabase";

vi.mock("@/lib/auth", () => ({ getUserId: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { GET, POST } from "@/app/api/insights/[id]/comments/route";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const INSIGHT_ID = "insight-comments";
const USER_ID    = "user-uuid-789";

function makeParams() {
  return { params: Promise.resolve({ id: INSIGHT_ID }) };
}
function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/insights/${INSIGHT_ID}/comments`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.mocked(getUserId).mockResolvedValue(null);
});

// ── GET ───────────────────────────────────────────────────────────────────────
describe("GET /api/insights/[id]/comments", () => {
  it("returns an empty array when there are no comments", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseMock({
        insight_comments: makeChain({ data: [], error: null }),
      }) as never
    );

    const res  = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.comments).toEqual([]);
  });

  it("returns comments enriched with display names and reaction counts", async () => {
    const commentsData = [
      { id: 1, body: "Great insight!", created_at: "2026-07-07T10:00:00Z", user_id: USER_ID },
    ];
    const profilesData  = [{ user_id: USER_ID, display_name: "Alice" }];
    const reactionsData = [{ comment_id: 1, type: "like", user_id: "other-user" }];

    let callIndex = 0;
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "insight_comments")  return makeChain({ data: commentsData, error: null });
        if (table === "user_profiles")     return makeChain({ data: profilesData, error: null });
        if (table === "comment_reactions") return makeChain({ data: reactionsData, error: null });
        return makeChain();
      }),
    } as never);

    const res  = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();

    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].display_name).toBe("Alice");
    expect(body.comments[0].likes).toBe(1);
    expect(body.comments[0].dislikes).toBe(0);
    expect(body.comments[0].is_mine).toBe(false); // user not signed in
  });

  it("marks is_mine correctly for the signed-in user's own comment", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    const commentsData  = [{ id: 2, body: "My comment", created_at: "2026-07-07T11:00:00Z", user_id: USER_ID }];
    const profilesData  = [{ user_id: USER_ID, display_name: "Alice" }];

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "insight_comments")  return makeChain({ data: commentsData, error: null });
        if (table === "user_profiles")     return makeChain({ data: profilesData, error: null });
        if (table === "comment_reactions") return makeChain({ data: [], error: null });
        return makeChain();
      }),
    } as never);

    const res  = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();
    expect(body.comments[0].is_mine).toBe(true);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────
describe("POST /api/insights/[id]/comments", () => {
  it("returns 401 when user is not signed in", async () => {
    const res = await POST(makeRequest("POST", { body: "Hello" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is empty", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseMock() as never);

    const res = await POST(makeRequest("POST", { body: "   " }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 when comment exceeds 2000 characters", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseMock() as never);

    const res = await POST(makeRequest("POST", { body: "x".repeat(2001) }), makeParams());
    expect(res.status).toBe(400);
  });

  it("creates a comment and returns it with profile display name", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);

    const newComment = { id: 10, body: "Nice!", created_at: "2026-07-07T12:00:00Z", user_id: USER_ID };
    const commentsChain = makeChain();
    vi.mocked(commentsChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: newComment, error: null,
    });
    const profileChain = makeChain();
    vi.mocked(profileChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { display_name: "Alice" }, error: null,
    });

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "insight_comments") return commentsChain;
        if (table === "user_profiles")    return profileChain;
        return makeChain();
      }),
    } as never);

    const res  = await POST(makeRequest("POST", { body: "Nice!" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.comment.body).toBe("Nice!");
    expect(data.comment.display_name).toBe("Alice");
    expect(data.comment.is_mine).toBe(true);
    expect(data.comment.likes).toBe(0);
  });
});
