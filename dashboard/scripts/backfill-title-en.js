/**
 * Backfill English translations for existing non-English episode titles.
 *
 * The pipeline now translates episode titles into English as part of LLM
 * extraction (see worker/providers/llm/prompts.py), but that only covers
 * episodes processed *after* that change shipped. This script finds
 * already-processed episodes with a non-English title and title_en still
 * unset, and translates just the title (a single lightweight LLM call per
 * episode, not a full re-extraction).
 *
 * Usage:
 *   node scripts/backfill-title-en.js            # dry run — report only, no writes
 *   node scripts/backfill-title-en.js --execute   # actually translate + save
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_KEY, and GEMINI_API_KEY (or
 * GROQ_API_KEY as fallback) in the environment, e.g.:
 *   node --env-file=../.env --env-file=.env.local scripts/backfill-title-en.js
 */

const { createClient } = require("@supabase/supabase-js");

const EXECUTE = process.argv.includes("--execute");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in environment.");
  process.exit(1);
}
if (!GEMINI_API_KEY && !GROQ_API_KEY) {
  console.error("Missing GEMINI_API_KEY and GROQ_API_KEY — need at least one to translate.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Heuristic: any character with a code point at or above U+0370 (Greek and
// everything after it — Cyrillic, Hebrew, Arabic, CJK, Hangul, etc.) means
// the title is very likely non-English. Codepoints below that cover Basic
// Latin, Latin-1 Supplement, and Latin Extended A/B — i.e. virtually all
// Western European languages — so the LLM call is only spent where needed.
// U+2010-U+2027 (General Punctuation: en/em dashes, curly quotes, ellipsis)
// is excluded too — common in English typography, not a language signal.
const NON_LATIN_MIN_CODEPOINT = 0x370;
const TYPOGRAPHIC_PUNCTUATION_RANGE = [0x2010, 0x2027];

function looksNonEnglish(title) {
  for (const ch of title) {
    const cp = ch.codePointAt(0);
    if (cp < NON_LATIN_MIN_CODEPOINT) continue;
    if (cp >= TYPOGRAPHIC_PUNCTUATION_RANGE[0] && cp <= TYPOGRAPHIC_PUNCTUATION_RANGE[1]) continue;
    return true;
  }
  return false;
}

async function translateTitle(title) {
  const prompt =
    `Translate this podcast episode title into English. Respond with ONLY the ` +
    `translated title — no quotes, no commentary, no markdown.\n\nTitle: ${title}`;

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 128, temperature: 0.1 },
          }),
        }
      );
      const body = await res.text();
      if (res.ok) {
        const data = JSON.parse(body);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (!(res.status === 429 || body.includes("RESOURCE_EXHAUSTED") || body.includes("quota"))) {
        throw new Error(`Gemini ${res.status}: ${body}`);
      }
      // else: quota exceeded — fall through to Groq
    } catch (e) {
      console.warn(`    Gemini failed (${e.message}), trying Groq...`);
    }
  }

  if (GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 128,
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? "";
  }

  throw new Error("No provider available");
}

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will translate + save)" : "DRY RUN (report only)"}\n`);

  const { data: episodes, error } = await sb
    .from("episodes")
    .select("id, title, title_en, status")
    .eq("status", "done")
    .is("title_en", null);
  if (error) throw error;

  const needsTranslation = episodes.filter((e) => looksNonEnglish(e.title));

  console.log(`${episodes.length} processed episode(s) missing title_en; ${needsTranslation.length} look non-English.\n`);

  if (needsTranslation.length === 0) {
    console.log("Nothing to translate.");
    return;
  }

  let done = 0;
  for (const ep of needsTranslation) {
    console.log(`[${++done}/${needsTranslation.length}] ${ep.title}`);
    try {
      const titleEn = await translateTitle(ep.title);
      console.log(`  -> ${titleEn}`);
      if (EXECUTE && titleEn) {
        const { error: updErr } = await sb.from("episodes").update({ title_en: titleEn }).eq("id", ep.id);
        if (updErr) throw updErr;
      }
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
    // Be polite to free-tier rate limits between calls.
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`\n${EXECUTE ? "Translated and saved" : "Would translate"} ${needsTranslation.length} title(s).`);
  if (!EXECUTE) {
    console.log("This was a dry run - no changes were made. Re-run with --execute to apply.");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
