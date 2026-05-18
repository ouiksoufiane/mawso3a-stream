-- الموسوعة ستريم — Supabase Schema
-- Run this in Supabase SQL Editor
-- Idempotent: safe to run multiple times

-- ─────────────────────────────────────────
-- CORE TABLES
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('film','series')),
  title_ar     TEXT NOT NULL,
  title_orig   TEXT,
  language     TEXT NOT NULL DEFAULT 'ar',
  origin       TEXT NOT NULL DEFAULT 'turkish',
  category     TEXT NOT NULL DEFAULT 'drama',
  poster_url   TEXT,
  yt_id        TEXT,
  total_eps    INTEGER DEFAULT 0,
  avail_eps    INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'active' CHECK (status IN ('active','hidden','incomplete','pending')),
  year           INTEGER,
  duration_sec   INTEGER,
  description    TEXT,
  embeddable     BOOLEAN DEFAULT true,
  view_count     INTEGER DEFAULT 0,
  quality_score  INTEGER DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS episodes (
  id           TEXT PRIMARY KEY,
  content_id   TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  season       INTEGER DEFAULT 1,
  episode      INTEGER,
  title_ar     TEXT,
  yt_id        TEXT NOT NULL UNIQUE,
  duration_sec INTEGER,
  embeddable   BOOLEAN DEFAULT true,
  darija_desc  TEXT,
  source       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discovery_log (
  id        SERIAL PRIMARY KEY,
  query     TEXT,
  found     INTEGER DEFAULT 0,
  imported  INTEGER DEFAULT 0,
  skipped   INTEGER DEFAULT 0,
  run_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- NEW TABLES
-- ─────────────────────────────────────────

-- Dead link reports from users
CREATE TABLE IF NOT EXISTS dead_links (
  id          SERIAL PRIMARY KEY,
  content_id  TEXT REFERENCES content(id) ON DELETE CASCADE,
  yt_id       TEXT,
  reports     INTEGER DEFAULT 1,
  last_report TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, yt_id)
);

-- User content requests
CREATE TABLE IF NOT EXISTS content_requests (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT DEFAULT 'film' CHECK (type IN ('film','series')),
  origin     TEXT,
  language   TEXT,
  notes      TEXT,
  ip         TEXT,
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending','done','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watch events for analytics (fire-and-forget)
CREATE TABLE IF NOT EXISTS watch_events (
  id         SERIAL PRIMARY KEY,
  content_id TEXT REFERENCES content(id) ON DELETE CASCADE,
  ip         TEXT,
  ua         TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin action log
CREATE TABLE IF NOT EXISTS admin_actions (
  id         SERIAL PRIMARY KEY,
  action     TEXT NOT NULL,
  target_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collections (playlists, editorial picks)
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  title_ar    TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  is_public   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  content_id    TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  position      INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, content_id)
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_content_type      ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_origin    ON content(origin);
CREATE INDEX IF NOT EXISTS idx_content_language  ON content(language);
CREATE INDEX IF NOT EXISTS idx_content_category  ON content(category);
CREATE INDEX IF NOT EXISTS idx_content_status    ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_year      ON content(year);
CREATE INDEX IF NOT EXISTS idx_content_views     ON content(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_content_created   ON content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_content  ON episodes(content_id);
CREATE INDEX IF NOT EXISTS idx_episodes_ytid     ON episodes(yt_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season   ON episodes(content_id, season);
CREATE INDEX IF NOT EXISTS idx_dead_links_cid    ON dead_links(content_id);
CREATE INDEX IF NOT EXISTS idx_watch_events_cid  ON watch_events(content_id);
CREATE INDEX IF NOT EXISTS idx_requests_status   ON content_requests(status);
CREATE INDEX IF NOT EXISTS idx_content_quality   ON content(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions     ON admin_actions(created_at DESC);

-- Full-text search on Arabic titles
CREATE INDEX IF NOT EXISTS idx_content_title_fts ON content USING gin(to_tsvector('simple', title_ar));

-- ─────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_updated ON content;
CREATE TRIGGER trg_content_updated
  BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update last_report on dead_links upsert
CREATE OR REPLACE FUNCTION update_dead_link_ts()
RETURNS TRIGGER AS $$
BEGIN NEW.last_report = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dead_link_updated ON dead_links;
CREATE TRIGGER trg_dead_link_updated
  BEFORE UPDATE ON dead_links
  FOR EACH ROW EXECUTE FUNCTION update_dead_link_ts();

-- ─────────────────────────────────────────
-- RPC FUNCTIONS
-- ─────────────────────────────────────────

-- Safely increment view_count
CREATE OR REPLACE FUNCTION increment_view(content_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE content SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = content_id AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate avail_eps from episodes table
CREATE OR REPLACE FUNCTION refresh_avail_eps(p_content_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE content
  SET avail_eps = (SELECT COUNT(*) FROM episodes WHERE content_id = p_content_id)
  WHERE id = p_content_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment avail_eps by 1 (called on episode insert by n8n)
CREATE OR REPLACE FUNCTION increment_avail_eps(p_content_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE content
  SET avail_eps = COALESCE(avail_eps, 0) + 1
  WHERE id = p_content_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upsert dead link report (increments count on conflict)
CREATE OR REPLACE FUNCTION report_dead_link(p_content_id TEXT, p_yt_id TEXT)
RETURNS INTEGER AS $$
DECLARE v_reports INTEGER;
BEGIN
  INSERT INTO dead_links (content_id, yt_id, reports)
  VALUES (p_content_id, p_yt_id, 1)
  ON CONFLICT (content_id, yt_id) DO UPDATE
    SET reports = dead_links.reports + 1;

  SELECT reports INTO v_reports
  FROM dead_links
  WHERE content_id = p_content_id AND yt_id IS NOT DISTINCT FROM p_yt_id;

  -- Auto-hide after 3+ reports
  IF v_reports >= 3 AND p_content_id IS NOT NULL THEN
    UPDATE content SET status = 'hidden' WHERE id = p_content_id;
  END IF;

  RETURN v_reports;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

ALTER TABLE content          ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating
DROP POLICY IF EXISTS "public_read_content"   ON content;
DROP POLICY IF EXISTS "public_read_episodes"  ON episodes;
DROP POLICY IF EXISTS "service_all_content"   ON content;
DROP POLICY IF EXISTS "service_all_episodes"  ON episodes;
DROP POLICY IF EXISTS "service_all_log"       ON discovery_log;

-- Public read
CREATE POLICY "public_read_content"   ON content  FOR SELECT TO anon USING (status != 'hidden');
CREATE POLICY "public_read_episodes"  ON episodes FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_collections"     ON collections      FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "public_read_collection_items" ON collection_items FOR SELECT TO anon USING (true);

-- Service role (API) can do everything
CREATE POLICY "service_all_content"   ON content          TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_episodes"  ON episodes         TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_log"       ON discovery_log    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_deadlinks" ON dead_links       TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_requests"  ON content_requests TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_events"    ON watch_events     TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_colls"     ON collections      TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_coll_items" ON collection_items TO service_role USING (true) WITH CHECK (true);

-- Admin actions: service role only (no public read)
CREATE POLICY "service_all_admin_actions" ON admin_actions TO service_role USING (true) WITH CHECK (true);

-- Migrations (run separately if content table already exists)
-- ALTER TABLE content ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
-- ALTER TABLE content ADD COLUMN IF NOT EXISTS status_check TEXT DEFAULT 'active' CHECK (...) -- already handled above

-- Grant RPC function execution to anon (view increment is public)
GRANT EXECUTE ON FUNCTION increment_view(TEXT) TO anon;
