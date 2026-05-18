-- الموسوعة ستريم — Supabase Schema
-- Run this in Supabase SQL Editor

-- Content table (films + series metadata)
CREATE TABLE IF NOT EXISTS content (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('film','series')),
  title_ar    TEXT NOT NULL,
  title_orig  TEXT,
  language    TEXT NOT NULL DEFAULT 'ar',
  origin      TEXT NOT NULL DEFAULT 'turkish',
  category    TEXT NOT NULL DEFAULT 'drama',
  poster_url  TEXT,
  yt_id       TEXT,
  total_eps   INTEGER DEFAULT 0,
  avail_eps   INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','hidden','incomplete')),
  year        INTEGER,
  duration_sec INTEGER,
  description TEXT,
  embeddable  BOOLEAN DEFAULT true,
  view_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Episodes table
CREATE TABLE IF NOT EXISTS episodes (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  season      INTEGER DEFAULT 1,
  episode     INTEGER,
  title_ar    TEXT,
  yt_id       TEXT NOT NULL UNIQUE,
  duration_sec INTEGER,
  embeddable  BOOLEAN DEFAULT true,
  darija_desc TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Discovery log (n8n audit trail)
CREATE TABLE IF NOT EXISTS discovery_log (
  id         SERIAL PRIMARY KEY,
  query      TEXT,
  found      INTEGER DEFAULT 0,
  imported   INTEGER DEFAULT 0,
  skipped    INTEGER DEFAULT 0,
  run_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_content_type     ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_origin   ON content(origin);
CREATE INDEX IF NOT EXISTS idx_content_language ON content(language);
CREATE INDEX IF NOT EXISTS idx_content_category ON content(category);
CREATE INDEX IF NOT EXISTS idx_content_status   ON content(status);
CREATE INDEX IF NOT EXISTS idx_episodes_content ON episodes(content_id);
CREATE INDEX IF NOT EXISTS idx_episodes_ytid    ON episodes(yt_id);

-- Full-text search on Arabic titles
CREATE INDEX IF NOT EXISTS idx_content_title_fts ON content USING gin(to_tsvector('simple', title_ar));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_content_updated
  BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_log ENABLE ROW LEVEL SECURITY;

-- Public can read active content
CREATE POLICY "public_read_content" ON content FOR SELECT TO anon USING (status != 'hidden');
CREATE POLICY "public_read_episodes" ON episodes FOR SELECT TO anon USING (true);

-- Service role can do everything (used by API)
CREATE POLICY "service_all_content" ON content TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_episodes" ON episodes TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_log" ON discovery_log TO service_role USING (true) WITH CHECK (true);
