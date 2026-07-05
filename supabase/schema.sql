-- Podcast Insights — Supabase schema
-- Run this once in the Supabase SQL editor (Database → SQL editor → New query)

CREATE TABLE IF NOT EXISTS sources (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    source_type TEXT NOT NULL,
    domain      TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS episodes (
    id               TEXT PRIMARY KEY,
    source_id        TEXT NOT NULL REFERENCES sources(id),
    title            TEXT NOT NULL,
    url              TEXT NOT NULL,
    published_at     TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    description      TEXT NOT NULL DEFAULT '',
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status           TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS transcripts (
    episode_id  TEXT PRIMARY KEY REFERENCES episodes(id),
    text        TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'en',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insights (
    id           TEXT PRIMARY KEY,
    episode_id   TEXT NOT NULL REFERENCES episodes(id),
    source_id    TEXT NOT NULL REFERENCES sources(id),
    domain       TEXT NOT NULL,
    date         TEXT NOT NULL,
    summary      TEXT NOT NULL,
    key_points   JSONB NOT NULL DEFAULT '[]',
    key_quotes   JSONB NOT NULL DEFAULT '[]',
    action_items JSONB NOT NULL DEFAULT '[]',
    tags         JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_date   ON insights(date);
CREATE INDEX IF NOT EXISTS idx_insights_domain ON insights(domain);
CREATE INDEX IF NOT EXISTS idx_episodes_source ON episodes(source_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
