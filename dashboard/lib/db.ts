/**
 * Unified data-access layer.
 * - Local dev:  SQLite via better-sqlite3  (SUPABASE_URL not set)
 * - Production: Supabase PostgreSQL        (SUPABASE_URL + SUPABASE_SERVICE_KEY set)
 *
 * All exports have the same signature regardless of backend.
 * Only imported in Server Components and API routes.
 *
 * Read queries (getInsightsByDate, getAvailableDates) are wrapped in
 * unstable_cache so Supabase is only hit once per hour in production.
 * Past-date insights never change; today's revalidate on 1-hour TTL.
 */

import { unstable_cache } from "next/cache";

// ─── Shared types ───────────────────────────────────────────────────────────

export interface PlatformLinks {
  spotify?: string;
  apple?: string;
  youtube?: string;
  website?: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: "rss" | "youtube";
  domain: string;
  enabled: boolean | number;
  deleted?: boolean | number;
  created_at: string;
  user_id?: string | null;
  is_public?: boolean;
  platform_links?: PlatformLinks;
}

/** Prefer the LLM-translated English title; fall back to the original for untranslated/English-original episodes. */
function displayTitle(ep: { title?: string; title_en?: string | null } | null | undefined): string | undefined {
  return (ep?.title_en || ep?.title) ?? undefined;
}

export interface EpisodeItem {
  id: string;          // MD5 of audioUrl — matches pipeline's episode_id
  title: string;
  publishedAt: string;
  audioUrl: string;    // enclosure URL — needed to trigger single-episode processing
  processed: boolean;  // true = insights exist in DB
}

export interface Insight {
  id: string;
  episode_id: string;
  source_id: string;
  domain: string;
  date: string;
  summary: string;
  key_points: string[];
  key_quotes: string[];
  action_items: string[];
  tags: string[];
  created_at: string;
  source_name?: string;
  episode_title?: string;
  episode_published_at?: string;
  platform_links?: PlatformLinks;
}

// ─── Backend detection ─────────────────────────────────────────────────────

function useSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

// ─── SQLite implementation ─────────────────────────────────────────────────

function getSqliteDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = require("path");
  const DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), "../data/podcasts.db");

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

function getSqliteDbWrite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = require("path");
  const DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), "../data/podcasts.db");

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  try { db.exec("ALTER TABLE sources ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  return db;
}

function parseSqliteInsight(row: Record<string, string>): Insight {
  return {
    ...row,
    key_points:   JSON.parse(row.key_points   || "[]"),
    key_quotes:   JSON.parse(row.key_quotes   || "[]"),
    action_items: JSON.parse(row.action_items || "[]"),
    tags:         JSON.parse(row.tags         || "[]"),
  } as unknown as Insight;
}

// ─── Supabase implementation ───────────────────────────────────────────────

async function sbGetSources(): Promise<Source[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("sources")
    .select("*")
    .eq("deleted", false)
    .order("domain").order("name");
  if (error) throw error;
  return data as Source[];
}

async function sbGetPublicSources(): Promise<Source[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("sources")
    .select("*")
    .eq("is_public", true)
    .eq("deleted", false)
    .order("domain").order("name");
  if (error) throw error;
  return data as Source[];
}

async function sbGetUserSubscriptions(userId: string): Promise<string[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) throw error;
  return (data ?? []).map((r: { source_id: string }) => r.source_id);
}

async function sbSubscribe(userId: string, sourceId: string): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("user_subscriptions")
    .upsert({ user_id: userId, source_id: sourceId, enabled: true }, { onConflict: "user_id,source_id" });
  if (error) throw error;
}

async function sbUnsubscribe(userId: string, sourceId: string): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("user_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("source_id", sourceId);
  if (error) throw error;
}

async function sbGetInsightsByDateForUser(date: string, userId: string): Promise<Insight[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  const sourceIds = (subs ?? []).map((r: { source_id: string }) => r.source_id);
  if (sourceIds.length === 0) return [];
  const { data, error } = await sb
    .from("insights")
    .select("*, sources(name, platform_links), episodes(title, title_en, published_at)")
    .eq("date", date)
    .in("source_id", sourceIds)
    .order("domain").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    source_name:           (r.sources as { name: string; platform_links?: PlatformLinks } | null)?.name,
    episode_title:         displayTitle(r.episodes as { title: string; title_en?: string; published_at?: string } | null),
    episode_published_at:  (r.episodes as { title: string; published_at?: string } | null)?.published_at,
    platform_links:        (r.sources as { name: string; platform_links?: PlatformLinks } | null)?.platform_links ?? {},
  })) as Insight[];
}

async function sbGetAvailableDatesForUser(userId: string): Promise<string[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  const sourceIds = (subs ?? []).map((r: { source_id: string }) => r.source_id);
  if (sourceIds.length === 0) return [];
  const { data, error } = await sb
    .from("insights")
    .select("date")
    .in("source_id", sourceIds)
    .order("date", { ascending: false });
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { date: string }) => r.date))];
}

async function sbAddSource(fields: {
  id: string; name: string; url: string; source_type: string; domain: string;
}): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data: existing } = await sb.from("sources").select("id").eq("url", fields.url).eq("deleted", false).maybeSingle();
  if (existing) throw new Error("A podcast with this feed URL already exists in the catalog.");
  const { error } = await sb.from("sources").insert({ ...fields, enabled: true, is_public: true });
  if (error) throw error;
}

async function sbDeleteSource(id: string): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb.from("sources").update({ deleted: true }).eq("id", id);
  if (error) throw error;
}

async function sbSetSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb.from("sources").update({ enabled }).eq("id", id);
  if (error) throw error;
}

async function sbSetSourceDomain(id: string, domain: string): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb.from("sources").update({ domain }).eq("id", id);
  if (error) throw error;
  // Cascade to existing insights so reclassified episodes show the new domain immediately
  const { error: insightError } = await sb.from("insights").update({ domain }).eq("source_id", id);
  if (insightError) throw insightError;
}

async function sbGetEpisodesWithInsights(_userId: string, sourceId: string): Promise<{ id: string; title: string; published_at: string }[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();

  // Single JOIN: insights → episodes (replaces the previous two-query approach)
  const { data, error } = await sb
    .from("insights")
    .select("episode_id, episodes!inner(id, title, title_en, published_at)")
    .eq("source_id", sourceId);
  if (error) throw error;

  // Deduplicate — multiple insights may share the same episode
  const seen = new Set<string>();
  const episodes: { id: string; title: string; published_at: string }[] = [];
  for (const row of (data ?? [])) {
    const ep = (row as { episode_id: string; episodes: { id: string; title: string; title_en?: string; published_at: string } }).episodes;
    if (ep && !seen.has(ep.id)) {
      seen.add(ep.id);
      episodes.push({ id: ep.id, title: displayTitle(ep) ?? "Untitled", published_at: ep.published_at ?? "" });
    }
  }
  return episodes.sort((a, b) => b.published_at.localeCompare(a.published_at));
}

async function sbGetInsightById(id: string): Promise<Insight | null> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("insights")
    .select("*, sources(name, platform_links), episodes(title, title_en, published_at)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...r,
    source_name:          (r.sources  as { name: string; platform_links?: PlatformLinks } | null)?.name,
    episode_title:        displayTitle(r.episodes as { title: string; title_en?: string; published_at?: string } | null),
    episode_published_at: (r.episodes as { title: string; published_at?: string } | null)?.published_at,
    platform_links:       (r.sources  as { name: string; platform_links?: PlatformLinks } | null)?.platform_links ?? {},
  } as Insight;
}

async function sbGetInsightsByEpisode(episodeId: string): Promise<Insight[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("insights")
    .select("*, sources(name, platform_links), episodes(title, title_en, published_at)")
    .eq("episode_id", episodeId)
    .order("domain");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    source_name:          (r.sources  as { name: string } | null)?.name,
    episode_title:        displayTitle(r.episodes as { title: string; title_en?: string; published_at?: string } | null),
    episode_published_at: (r.episodes as { title: string; published_at?: string } | null)?.published_at,
  })) as Insight[];
}

async function sbGetInsightsByDate(date: string): Promise<Insight[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("insights")
    .select("*, sources(name, platform_links), episodes(title, title_en, published_at)")
    .eq("date", date)
    .order("domain").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    source_name:           (r.sources as { name: string; platform_links?: PlatformLinks } | null)?.name,
    episode_title:         displayTitle(r.episodes as { title: string; title_en?: string; published_at?: string } | null),
    episode_published_at:  (r.episodes as { title: string; published_at?: string } | null)?.published_at,
    platform_links:        (r.sources as { name: string; platform_links?: PlatformLinks } | null)?.platform_links ?? {},
  })) as Insight[];
}

async function sbGetAvailableDates(): Promise<string[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("insights")
    .select("date")
    .order("date", { ascending: false });
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { date: string }) => r.date))];
}

// ─── Public API (same shape for both backends) ─────────────────────────────

export function getSources(): Source[] {
  if (useSupabase()) throw new Error("getSources: use getSourcesAsync in Supabase mode");
  const db = getSqliteDb();
  return db.prepare(
    "SELECT * FROM sources WHERE (deleted = 0 OR deleted IS NULL) ORDER BY domain, name"
  ).all() as Source[];
}

export async function getSourcesAsync(): Promise<Source[]> {
  if (useSupabase()) return sbGetSources();
  return getSources();
}

export function addSource(fields: {
  id: string; name: string; url: string; source_type: "rss" | "youtube"; domain: string;
}): void {
  const db = getSqliteDbWrite();
  db.prepare(`
    INSERT INTO sources (id, name, url, source_type, domain, enabled, created_at)
    VALUES (@id, @name, @url, @source_type, @domain, 1, datetime('now'))
  `).run(fields);
}

export async function addSourceAsync(fields: {
  id: string; name: string; url: string; source_type: "rss" | "youtube"; domain: string;
}): Promise<void> {
  if (useSupabase()) return sbAddSource(fields);
  addSource(fields);
}

export function deleteSource(id: string): void {
  const db = getSqliteDbWrite();
  db.prepare("UPDATE sources SET deleted = 1 WHERE id = ?").run(id);
}

export async function deleteSourceAsync(id: string): Promise<void> {
  if (useSupabase()) return sbDeleteSource(id);
  deleteSource(id);
}

export function setSourceEnabled(id: string, enabled: boolean): void {
  const db = getSqliteDbWrite();
  db.prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export async function setSourceEnabledAsync(id: string, enabled: boolean): Promise<void> {
  if (useSupabase()) return sbSetSourceEnabled(id, enabled);
  setSourceEnabled(id, enabled);
}

export function setSourceDomain(id: string, domain: string): void {
  const db = getSqliteDbWrite();
  db.prepare("UPDATE sources SET domain = ? WHERE id = ?").run(domain, id);
}

export async function setSourceDomainAsync(id: string, domain: string): Promise<void> {
  if (useSupabase()) return sbSetSourceDomain(id, domain);
  setSourceDomain(id, domain);
}

// ─── Cached Supabase reads (1-hour TTL) ───────────────────────────────────

const _cachedGetInsightsByDate = unstable_cache(
  sbGetInsightsByDate,
  ["insights-by-date"],
  { revalidate: 3600, tags: ["insights"] },
);

const _cachedGetAvailableDates = unstable_cache(
  sbGetAvailableDates,
  ["available-dates"],
  { revalidate: 3600, tags: ["insights"] },
);

export async function getInsightsByDate(date: string, userId?: string | null): Promise<Insight[]> {
  if (useSupabase()) {
    if (userId) return sbGetInsightsByDateForUser(date, userId);
    return _cachedGetInsightsByDate(date);
  }
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT i.*, s.name AS source_name, COALESCE(NULLIF(e.title_en, ''), e.title) AS episode_title, e.published_at AS episode_published_at
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    WHERE i.date = ?
    ORDER BY i.domain, i.created_at DESC
  `).all(date) as Record<string, string>[];
  return rows.map(parseSqliteInsight);
}

export async function getAvailableDates(userId?: string | null): Promise<string[]> {
  if (useSupabase()) {
    if (userId) return sbGetAvailableDatesForUser(userId);
    return _cachedGetAvailableDates();
  }
  const db = getSqliteDb();
  const rows = db.prepare(
    "SELECT DISTINCT date FROM insights ORDER BY date DESC"
  ).all() as { date: string }[];
  return rows.map((r) => r.date);
}

export async function getPublicSourcesAsync(): Promise<Source[]> {
  if (useSupabase()) return sbGetPublicSources();
  return getSourcesAsync(); // SQLite: all sources are "public"
}

export async function getUserSubscriptions(userId: string): Promise<string[]> {
  if (useSupabase()) return sbGetUserSubscriptions(userId);
  return []; // SQLite local dev: no subscription concept
}

export async function subscribeToSource(userId: string, sourceId: string): Promise<void> {
  if (useSupabase()) return sbSubscribe(userId, sourceId);
}

export async function unsubscribeFromSource(userId: string, sourceId: string): Promise<void> {
  if (useSupabase()) return sbUnsubscribe(userId, sourceId);
}

export async function getEpisodesWithInsights(userId: string, sourceId: string): Promise<{ id: string; title: string; published_at: string }[]> {
  if (useSupabase()) return sbGetEpisodesWithInsights(userId, sourceId);
  return []; // SQLite local dev: not supported
}

export async function getInsightById(id: string): Promise<Insight | null> {
  if (useSupabase()) return sbGetInsightById(id);
  const db = getSqliteDb();
  const row = db.prepare(`
    SELECT i.*, s.name AS source_name, COALESCE(NULLIF(e.title_en, ''), e.title) AS episode_title, e.published_at AS episode_published_at
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    WHERE i.id = ?
  `).get(id) as Record<string, string> | undefined;
  return row ? parseSqliteInsight(row) : null;
}

export async function getInsightsByEpisode(episodeId: string): Promise<Insight[]> {
  if (useSupabase()) return sbGetInsightsByEpisode(episodeId);
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT i.*, s.name AS source_name, COALESCE(NULLIF(e.title_en, ''), e.title) AS episode_title, e.published_at AS episode_published_at
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    WHERE i.episode_id = ?
    ORDER BY i.domain
  `).all(episodeId) as Record<string, string>[];
  return rows.map(parseSqliteInsight);
}

export async function getUserTimezone(userId: string): Promise<string> {
  if (useSupabase()) {
    const { getSupabaseClient } = await import("./supabase");
    const sb = getSupabaseClient();
    const { data } = await sb
      .from("user_profiles")
      .select("digest_timezone")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as { digest_timezone?: string } | null)?.digest_timezone || "UTC";
  }
  return "UTC";
}

export async function getRecentInsights(limit = 20): Promise<Insight[]> {
  if (useSupabase()) {
    const { getSupabaseClient } = await import("./supabase");
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("insights")
      .select("*, sources(name, platform_links), episodes(title, title_en, published_at)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      source_name:          (r.sources  as { name: string } | null)?.name,
      episode_title:        displayTitle(r.episodes as { title: string; title_en?: string; published_at?: string } | null),
      episode_published_at: (r.episodes as { title: string; published_at?: string } | null)?.published_at,
    })) as Insight[];
  }
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT i.*, s.name AS source_name, COALESCE(NULLIF(e.title_en, ''), e.title) AS episode_title, e.published_at AS episode_published_at
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    ORDER BY i.created_at DESC
    LIMIT ?
  `).all(limit) as Record<string, string>[];
  return rows.map(parseSqliteInsight);
}
