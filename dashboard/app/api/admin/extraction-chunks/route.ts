import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const RECENT_EPISODES_LIMIT = 15;
const RAW_ROWS_LIMIT = 1000; // enough chunk rows to fully cover RECENT_EPISODES_LIMIT episodes

interface ChunkRow {
  id: number;
  episode_id: string;
  source_id: string;
  chunk_index: number;
  total_chunks: number;
  phase: string;
  provider_name: string;
  status: string;
  error_msg: string | null;
  created_at: string;
}

/**
 * Per-episode chunking/transcription detail for the admin Task Status page —
 * how many chunks each recently-processed episode's transcript was split
 * into, which LLM model handled each chunk, and whether it succeeded. Backed
 * by extraction_chunk_log (migration 021), written by chunked_extract()
 * (worker/providers/llm/chunking.py) as a best-effort side log.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();

  const { data: rows, error } = await sb
    .from("extraction_chunk_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RAW_ROWS_LIMIT);

  if (error) {
    // Table may not exist yet if migration 021 hasn't been run.
    console.error("[admin/extraction-chunks] failed to read extraction_chunk_log:", error.message);
    return NextResponse.json({ episodes: [] });
  }

  const chunkRows = (rows ?? []) as ChunkRow[];

  // Rows are newest-first, so the first time we see an episode_id is its
  // most recent activity — take the first N distinct episodes in that order.
  const episodeOrder: string[] = [];
  const byEpisode = new Map<string, ChunkRow[]>();
  for (const row of chunkRows) {
    if (!byEpisode.has(row.episode_id)) {
      if (episodeOrder.length >= RECENT_EPISODES_LIMIT) continue;
      episodeOrder.push(row.episode_id);
      byEpisode.set(row.episode_id, []);
    }
    byEpisode.get(row.episode_id)?.push(row);
  }

  const episodeIds = episodeOrder;
  const sourceIds = [...new Set(episodeOrder.map((id) => byEpisode.get(id)![0].source_id))];

  const [{ data: episodesData }, { data: sourcesData }] = await Promise.all([
    episodeIds.length > 0
      ? sb.from("episodes").select("id, title, title_en").in("id", episodeIds)
      : Promise.resolve({ data: [] as { id: string; title: string; title_en: string | null }[] }),
    sourceIds.length > 0
      ? sb.from("sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const episodeTitleById = new Map((episodesData ?? []).map((e) => [e.id, e.title_en || e.title]));
  const sourceNameById = new Map((sourcesData ?? []).map((s) => [s.id, s.name]));

  const episodes = episodeOrder.map((episodeId) => {
    const chunks = (byEpisode.get(episodeId) ?? []).sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === "summary" ? -1 : 1;
      return a.chunk_index - b.chunk_index;
    });
    const totalChunks = chunks[0]?.total_chunks ?? 0;
    const hasFailure = chunks.some((c) => c.status === "failed");
    const latestEventAt = chunks.reduce((max, c) => (c.created_at > max ? c.created_at : max), chunks[0]?.created_at ?? "");
    return {
      episodeId,
      sourceId: chunks[0]?.source_id ?? "",
      episodeTitle: episodeTitleById.get(episodeId) ?? episodeId,
      sourceName: sourceNameById.get(chunks[0]?.source_id ?? "") ?? "Unknown source",
      totalChunks,
      hasFailure,
      latestEventAt,
      chunks: chunks.map((c) => ({
        chunkIndex: c.chunk_index,
        totalChunks: c.total_chunks,
        phase: c.phase,
        providerName: c.provider_name,
        status: c.status,
        errorMsg: c.error_msg,
        createdAt: c.created_at,
      })),
    };
  });

  return NextResponse.json({ episodes });
}
