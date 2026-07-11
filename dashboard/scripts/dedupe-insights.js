/**
 * History check: find and clean up duplicate insights across all domains/dates.
 *
 * Root cause: some RSS feeds rotate audio URLs (ad-insertion / tracking
 * redirects) on every fetch. The pipeline derives episode_id from the audio
 * URL, so the same episode (same source + title + published_at) can end up
 * stored under two different episode_ids, each with its own insight — a
 * duplicate. (Fixed prospectively in worker/jobs/pipeline.py — this script
 * cleans up duplicates that already exist in the database.)
 *
 * A "duplicate group" = episodes with the same (source_id, title,
 * published_at) but different ids. Within each group we keep exactly one
 * episode (the "survivor") and delete the rest, in this priority order:
 *   1. has bookmarks
 *   2. has comments
 *   3. has reactions (likes/dislikes)
 *   4. most views
 *   5. earliest insight created_at (tie-break: earliest episode fetched_at)
 *
 * Usage:
 *   node scripts/dedupe-insights.js            # dry run — report only, no writes
 *   node scripts/dedupe-insights.js --execute   # actually delete the losers
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment
 * (e.g. `node --env-file=.env.local scripts/dedupe-insights.js`).
 */

const { createClient } = require("@supabase/supabase-js");

const EXECUTE = process.argv.includes("--execute");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in environment.");
  console.error("Run with: node --env-file=.env.local scripts/dedupe-insights.js");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will delete losers)" : "DRY RUN (report only)"}\n`);

  const { data: episodes, error: epErr } = await sb
    .from("episodes")
    .select("id, source_id, title, published_at, fetched_at, status")
    .eq("status", "done");
  if (epErr) throw epErr;

  const { data: sources, error: srcErr } = await sb.from("sources").select("id, name");
  if (srcErr) throw srcErr;
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));

  // Group by (source_id, title, published_at)
  const groups = new Map();
  for (const ep of episodes) {
    const key = `${ep.source_id}::${ep.title}::${ep.published_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ep);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);

  if (dupGroups.length === 0) {
    console.log("No duplicate episodes found. Nothing to do.");
    return;
  }

  console.log(`Found ${dupGroups.length} duplicate group(s):\n`);

  let totalDeleted = 0;

  for (const group of dupGroups) {
    const { source_id, title, published_at } = group[0];
    console.log("─".repeat(70));
    console.log(`${sourceName.get(source_id) ?? source_id} — "${title}"`);
    console.log(`published_at: ${published_at}`);

    // Gather insights + engagement for every episode in this group
    const enriched = [];
    for (const ep of group) {
      const { data: insights, error: insErr } = await sb
        .from("insights")
        .select("id, date, domain, created_at")
        .eq("episode_id", ep.id);
      if (insErr) throw insErr;

      const insightIds = insights.map((i) => i.id);
      let views = 0, reactions = 0, comments = 0, bookmarks = 0;
      if (insightIds.length > 0) {
        const counts = await Promise.all([
          sb.from("insight_views").select("id", { count: "exact", head: true }).in("insight_id", insightIds),
          sb.from("insight_reactions").select("id", { count: "exact", head: true }).in("insight_id", insightIds),
          sb.from("insight_comments").select("id", { count: "exact", head: true }).in("insight_id", insightIds),
          sb.from("insight_bookmarks").select("id", { count: "exact", head: true }).in("insight_id", insightIds),
        ]);
        [views, reactions, comments, bookmarks] = counts.map((c) => c.count ?? 0);
      }

      const earliestInsightCreatedAt = insights.length
        ? insights.map((i) => i.created_at).sort()[0]
        : null;

      enriched.push({ episode: ep, insights, views, reactions, comments, bookmarks, earliestInsightCreatedAt });

      console.log(
        `  episode ${ep.id.slice(0, 8)} — ${insights.length} insight(s) ` +
        `[${insights.map((i) => `${i.domain}/${i.date}`).join(", ") || "none"}] ` +
        `views=${views} reactions=${reactions} comments=${comments} bookmarks=${bookmarks} ` +
        `fetched_at=${ep.fetched_at}`
      );
    }

    // Pick the survivor
    const survivor = enriched.slice().sort((a, b) => {
      if (a.bookmarks !== b.bookmarks) return b.bookmarks - a.bookmarks;
      if (a.comments !== b.comments) return b.comments - a.comments;
      if (a.reactions !== b.reactions) return b.reactions - a.reactions;
      if (a.views !== b.views) return b.views - a.views;
      const aTime = a.earliestInsightCreatedAt ?? a.episode.fetched_at;
      const bTime = b.earliestInsightCreatedAt ?? b.episode.fetched_at;
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    })[0];

    console.log(`  → keeping episode ${survivor.episode.id.slice(0, 8)}`);

    const losers = enriched.filter((e) => e.episode.id !== survivor.episode.id);
    for (const loser of losers) {
      console.log(`  → deleting episode ${loser.episode.id.slice(0, 8)} and its ${loser.insights.length} insight(s)`);
      totalDeleted += loser.insights.length;

      if (EXECUTE) {
        // Order matters: insights first (cascades views/reactions/comments/bookmarks),
        // then transcripts, then episode_queue, then the episode row itself.
        const { error: delInsErr } = await sb.from("insights").delete().eq("episode_id", loser.episode.id);
        if (delInsErr) throw delInsErr;

        const { error: delTransErr } = await sb.from("transcripts").delete().eq("episode_id", loser.episode.id);
        if (delTransErr) throw delTransErr;

        // Best-effort: service_role has no PostgREST grants on episode_queue in
        // this project (only anon does, for the browser's Realtime subscription;
        // the worker writes to it via a direct Postgres connection instead). A
        // leftover row referencing a deleted episode_id is harmless — nothing
        // will ever look it up again — so don't let this block the real cleanup.
        const { error: delQueueErr } = await sb.from("episode_queue").delete().eq("episode_id", loser.episode.id);
        if (delQueueErr) console.warn(`    (skipped episode_queue cleanup: ${delQueueErr.message})`);

        const { error: delEpErr } = await sb.from("episodes").delete().eq("id", loser.episode.id);
        if (delEpErr) throw delEpErr;
      }
    }
  }

  console.log("─".repeat(70));
  console.log(
    `\n${EXECUTE ? "Deleted" : "Would delete"} ${totalDeleted} duplicate insight(s) ` +
    `across ${dupGroups.length} episode group(s).`
  );
  if (!EXECUTE) {
    console.log("This was a dry run — no changes were made. Re-run with --execute to apply.");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
