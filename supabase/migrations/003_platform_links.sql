-- Migration 003: Platform links for podcast sources
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS platform_links JSONB NOT NULL DEFAULT '{}';
