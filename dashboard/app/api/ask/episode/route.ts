import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { runWaterfall } from "@/lib/llm-waterfall";

// Safe single-call budget across every ask_ai-scope provider (matches the
// tightest free-tier limit among them — Groq's TPM cap) — no chunking here,
// unlike the pipeline's extraction: this is one ad-hoc question, not a full
// structured extraction, so a straightforward truncation is an acceptable
// trade-off rather than paying for several extra LLM calls per question.
const MAX_TRANSCRIPT_CHARS = 16_000;

interface EpisodeRow {
  id: string;
  title: string;
  title_en: string | null;
  source_id: string;
}

async function loadEpisodeAndVerifySubscription(
  sb: ReturnType<typeof getSupabaseClient>, userId: string, episodeId: string
): Promise<{ episode: EpisodeRow; error?: never } | { episode?: never; error: NextResponse }> {
  const { data: episode } = await sb
    .from("episodes")
    .select("id, title, title_en, source_id")
    .eq("id", episodeId)
    .maybeSingle();
  if (!episode) {
    return { error: NextResponse.json({ error: "Episode not found" }, { status: 404 }) };
  }

  const { data: sub } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("source_id", episode.source_id)
    .maybeSingle();
  if (!sub) {
    return { error: NextResponse.json({ error: "Not subscribed to this podcast" }, { status: 403 }) };
  }

  return { episode: episode as EpisodeRow };
}

/** Episode metadata for the /ask page's episode picker / deep-link header (?episode=<id>). */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get("id");
  if (!episodeId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const sb = getSupabaseClient();
  const result = await loadEpisodeAndVerifySubscription(sb, userId, episodeId);
  if (result.error) return result.error;
  const { episode } = result;

  const [{ data: source }, { data: transcript }] = await Promise.all([
    sb.from("sources").select("name").eq("id", episode.source_id).maybeSingle(),
    sb.from("transcripts").select("episode_id").eq("episode_id", episodeId).maybeSingle(),
  ]);

  return NextResponse.json({
    title: episode.title_en || episode.title,
    sourceName: source?.name ?? "",
    sourceId: episode.source_id,
    hasTranscript: Boolean(transcript),
  });
}

/**
 * Answers a free-form question about one specific episode using its saved
 * transcript directly — for episodes that haven't been through (or failed)
 * insight extraction yet, this still works as long as a transcript was
 * saved. Reuses the same admin-configurable waterfall as the main Ask AI
 * chat (scope='ask_ai', lib/llm-waterfall.ts).
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { episodeId?: string; question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const episodeId = body.episodeId;
  const question = (body.question ?? "").trim();
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  if (!question || question.length < 3) {
    return NextResponse.json({ error: "Question is too short" }, { status: 400 });
  }

  const sb = getSupabaseClient();
  const result = await loadEpisodeAndVerifySubscription(sb, userId, episodeId);
  if (result.error) return result.error;
  const { episode } = result;

  const { data: transcriptRow } = await sb
    .from("transcripts")
    .select("text")
    .eq("episode_id", episodeId)
    .maybeSingle();

  if (!transcriptRow?.text) {
    return NextResponse.json(
      {
        error:
          "This episode hasn't been transcribed yet, so there's no content to answer from. " +
          "Episodes are picked up automatically every few hours, or you can process it now from the Episode Digest section on your Profile page.",
      },
      { status: 404 }
    );
  }

  const title = episode.title_en || episode.title;
  const truncated = transcriptRow.text.length > MAX_TRANSCRIPT_CHARS;
  const transcriptText = truncated ? transcriptRow.text.slice(0, MAX_TRANSCRIPT_CHARS) : transcriptRow.text;

  const prompt = `You are answering a question about a specific podcast episode using its transcript.

Episode title: ${title}

Transcript${truncated ? " (truncated to the first portion — the episode may continue beyond what's shown here)" : ""}:
${transcriptText}

Question: ${question}

Answer using only the transcript above. Be concise and specific. If the answer isn't covered in the transcript, say so honestly rather than guessing.`;

  try {
    const { text, model } = await runWaterfall("ask_ai", prompt);
    return NextResponse.json({ answer: text, model, episodeTitle: title, truncated });
  } catch (err) {
    console.error("[ask/episode] all providers failed:", err);
    return NextResponse.json(
      { error: "All AI providers are currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
