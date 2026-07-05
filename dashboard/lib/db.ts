/**
 * Unified data-access layer.
 * - Local dev:  SQLite via better-sqlite3  (SUPABASE_URL not set)
 * - Production: Supabase PostgreSQL        (SUPABASE_URL + SUPABASE_SERVICE_KEY set)
 *
 * All exports have the same signature regardless of backend.
 * Only imported in Server Components and API routes.
 */

// ─── Shared types ──────────────────────────────────────────────────────────

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: "rss" | "youtube";
  domain: string;
  enabled: boolean | number;
  deleted?: boolean | number;
  created_at: string;
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

async function sbAddSource(fields: {
  id: string; name: string; url: string; source_type: string; domain: string;
}): Promise<void> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { error } = await sb.from("sources").insert({ ...fields, enabled: true });
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

async function sbGetInsightsByDate(date: string): Promise<Insight[]> {
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("insights")
    .select("*, sources(name), episodes(title)")
    .eq("date", date)
    .order("domain").order("created_at");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    source_name:   (r.sources as { name: string } | null)?.name,
    episode_title: (r.episodes as { title: string } | null)?.title,
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

export async function getInsightsByDate(date: string): Promise<Insight[]> {
  if (useSupabase()) return sbGetInsightsByDate(date);
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT i.*, s.name AS source_name, e.title AS episode_title
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    WHERE i.date = ?
    ORDER BY i.domain, i.created_at
  `).all(date) as Record<string, string>[];
  return rows.map(parseSqliteInsight);
}

export async function getAvailableDates(): Promise<string[]> {
  if (useSupabase()) return sbGetAvailableDates();
  const db = getSqliteDb();
  const rows = db.prepare(
    "SELECT DISTINCT date FROM insights ORDER BY date DESC"
  ).all() as { date: string }[];
  return rows.map((r) => r.date);
}

export async function getRecentInsights(limit = 20): Promise<Insight[]> {
  if (useSupabase()) {
    const { getSupabaseClient } = await import("./supabase");
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("insights")
      .select("*, sources(name), episodes(title)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      source_name:   (r.sources as { name: string } | null)?.name,
      episode_title: (r.episodes as { title: string } | null)?.title,
    })) as Insight[];
  }
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT i.*, s.name AS source_name, e.title AS episode_title
    FROM insights i
    LEFT JOIN sources  s ON s.id = i.source_id
    LEFT JOIN episodes e ON e.id = i.episode_id
    ORDER BY i.created_at DESC
    LIMIT ?
  `).all(limit) as Record<string, string>[];
  return rows.map(parseSqliteInsight);
}
