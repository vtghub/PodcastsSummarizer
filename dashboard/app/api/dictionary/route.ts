import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const POS_ORDER: Record<string, number> = { noun: 0, verb: 1, adjective: 2, adverb: 3 };

/**
 * Direct dictionary lookup for the insight card word-lookup feature — a
 * plain retrieval query against dictionary_entries (seeded from WordNet,
 * migration 022 + worker/jobs/seed_dictionary.py), no LLM call. Public —
 * dictionary definitions aren't user-specific or sensitive, and the lookup
 * works for guests reading the public insight preview too.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("word") ?? "").trim().toLowerCase();

  // Strip surrounding punctuation a double-click selection can pick up
  // (quotes, trailing periods/commas) — keep internal apostrophes (e.g. "don't").
  const word = raw.replace(/^[^a-z']+|[^a-z']+$/g, "");
  if (!word || !/^[a-z']+$/.test(word)) {
    return NextResponse.json({ word: raw, entries: [] });
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("dictionary_entries")
    .select("pos, definition, examples, synonyms")
    .eq("word", word)
    .limit(12);

  if (error) {
    // Table may not exist yet if migration 022 / the seed job hasn't run.
    console.error("[dictionary] lookup failed:", error.message);
    return NextResponse.json({ word, entries: [], error: "Dictionary not available yet" });
  }

  const entries = (data ?? []).sort(
    (a, b) => (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9)
  );

  return NextResponse.json({ word, entries });
}
