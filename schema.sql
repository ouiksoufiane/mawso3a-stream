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
-- MIGRATIONS (add columns missing from existing tables)
-- ─────────────────────────────────────────

ALTER TABLE content ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;

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
-- EXTENDED TABLES
-- ─────────────────────────────────────────

-- Content sources (YouTube channels/playlists, future: Dailymotion, Vimeo)
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube','dailymotion','vimeo','archive','other')),
  source_type TEXT NOT NULL DEFAULT 'channel' CHECK (source_type IN ('channel','playlist','search')),
  source_id   TEXT NOT NULL,
  name_ar     TEXT,
  language    TEXT DEFAULT 'ar_dubbed',
  origin      TEXT,
  active      BOOLEAN DEFAULT true,
  priority    INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  last_synced TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Genre taxonomy (richer than single category field)
CREATE TABLE IF NOT EXISTS genres (
  id      TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT
);

-- Content ↔ Genre many-to-many
CREATE TABLE IF NOT EXISTS content_genres (
  content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  genre_id   TEXT NOT NULL REFERENCES genres(id)  ON DELETE CASCADE,
  PRIMARY KEY (content_id, genre_id)
);

-- Detailed per-item import log
CREATE TABLE IF NOT EXISTS import_logs (
  id         SERIAL PRIMARY KEY,
  source_id  TEXT,
  action     TEXT NOT NULL,
  content_id TEXT REFERENCES content(id) ON DELETE SET NULL,
  status     TEXT DEFAULT 'success' CHECK (status IN ('success','skipped','error')),
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search query analytics
CREATE TABLE IF NOT EXISTS search_logs (
  id         SERIAL PRIMARY KEY,
  query      TEXT NOT NULL,
  results    INTEGER DEFAULT 0,
  ip         TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Homepage featured sections (editorial curation)
CREATE TABLE IF NOT EXISTS featured_sections (
  id          TEXT PRIMARY KEY,
  title_ar    TEXT NOT NULL,
  query_type  TEXT NOT NULL CHECK (query_type IN ('origin','category','manual','trending','new','type')),
  query_value TEXT,
  position    INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  limit_count INTEGER DEFAULT 10,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed genres
INSERT INTO genres (id, name_ar, name_en) VALUES
  ('drama',      'دراما',          'Drama'),
  ('action',     'أكشن',           'Action'),
  ('comedy',     'كوميدي',         'Comedy'),
  ('romance',    'رومانسي',        'Romance'),
  ('horror',     'رعب',            'Horror'),
  ('thriller',   'إثارة',          'Thriller'),
  ('sci-fi',     'خيال علمي',      'Sci-Fi'),
  ('animation',  'رسوم متحركة',    'Animation'),
  ('documentary','وثائقي',         'Documentary'),
  ('historical', 'تاريخي',         'Historical'),
  ('fantasy',    'خيال',           'Fantasy'),
  ('family',     'عائلي',          'Family'),
  ('crime',      'جريمة',          'Crime'),
  ('mystery',    'غموض وتشويق',    'Mystery')
ON CONFLICT (id) DO NOTHING;

-- Seed featured sections
INSERT INTO featured_sections (id, title_ar, query_type, query_value, position, active, limit_count) VALUES
  ('trending',  'الأكثر مشاهدةً',        'trending', null,       1, true, 12),
  ('new',       'أحدث الإضافات',          'new',      null,       2, true, 12),
  ('turkish',   '🇹🇷 المسلسلات التركية',  'origin',   'turkish',  3, true, 12),
  ('indian',    '🇮🇳 المسلسلات الهندية',  'origin',   'indian',   4, true, 10),
  ('korean',    '🇰🇷 المسلسلات الكورية',  'origin',   'korean',   5, true, 10),
  ('films',     '🎬 أفلام مميزة',          'type',     'film',     6, true, 12)
ON CONFLICT (id) DO NOTHING;

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

-- New table indexes
CREATE INDEX IF NOT EXISTS idx_sources_platform     ON sources(platform);
CREATE INDEX IF NOT EXISTS idx_sources_active       ON sources(active);
CREATE INDEX IF NOT EXISTS idx_content_genres_cid   ON content_genres(content_id);
CREATE INDEX IF NOT EXISTS idx_content_genres_gid   ON content_genres(genre_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_cid      ON import_logs(content_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status   ON import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_created  ON import_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_query    ON search_logs(query);
CREATE INDEX IF NOT EXISTS idx_search_logs_created  ON search_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_featured_position    ON featured_sections(position) WHERE active = true;

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
DROP FUNCTION IF EXISTS increment_avail_eps(TEXT);
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
ALTER TABLE sources          ENABLE ROW LEVEL SECURITY;
ALTER TABLE genres           ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_genres   ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_sections ENABLE ROW LEVEL SECURITY;

-- Drop ALL policies before recreating (fully idempotent)
DROP POLICY IF EXISTS "public_read_content"          ON content;
DROP POLICY IF EXISTS "public_read_episodes"         ON episodes;
DROP POLICY IF EXISTS "public_read_collections"      ON collections;
DROP POLICY IF EXISTS "public_read_collection_items" ON collection_items;
DROP POLICY IF EXISTS "public_read_genres"           ON genres;
DROP POLICY IF EXISTS "public_read_content_genres"   ON content_genres;
DROP POLICY IF EXISTS "public_read_featured"         ON featured_sections;

DROP POLICY IF EXISTS "service_all_content"          ON content;
DROP POLICY IF EXISTS "service_all_episodes"         ON episodes;
DROP POLICY IF EXISTS "service_all_log"              ON discovery_log;
DROP POLICY IF EXISTS "service_all_deadlinks"        ON dead_links;
DROP POLICY IF EXISTS "service_all_requests"         ON content_requests;
DROP POLICY IF EXISTS "service_all_events"           ON watch_events;
DROP POLICY IF EXISTS "service_all_colls"            ON collections;
DROP POLICY IF EXISTS "service_all_coll_items"       ON collection_items;
DROP POLICY IF EXISTS "service_all_sources"          ON sources;
DROP POLICY IF EXISTS "service_all_genres"           ON genres;
DROP POLICY IF EXISTS "service_all_content_genres"   ON content_genres;
DROP POLICY IF EXISTS "service_all_import_logs"      ON import_logs;
DROP POLICY IF EXISTS "service_all_search_logs"      ON search_logs;
DROP POLICY IF EXISTS "service_all_featured"         ON featured_sections;
DROP POLICY IF EXISTS "service_all_admin_actions"    ON admin_actions;

-- Public read: only active content (not pending, hidden, incomplete)
CREATE POLICY "public_read_content"
  ON content FOR SELECT TO anon
  USING (status = 'active');

-- Episodes readable only if parent series is active
CREATE POLICY "public_read_episodes"
  ON episodes FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM content
      WHERE content.id = episodes.content_id
        AND content.status = 'active'
    )
  );

CREATE POLICY "public_read_collections"      ON collections      FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "public_read_collection_items" ON collection_items FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_genres"           ON genres           FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_content_genres"   ON content_genres   FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_featured"         ON featured_sections FOR SELECT TO anon USING (active = true);

-- Service role (API) can do everything
CREATE POLICY "service_all_content"       ON content           TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_episodes"      ON episodes          TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_log"           ON discovery_log     TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_deadlinks"     ON dead_links        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_requests"      ON content_requests  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_events"        ON watch_events      TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_colls"         ON collections       TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_coll_items"    ON collection_items  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_sources"       ON sources           TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_genres"        ON genres            TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_content_genres" ON content_genres   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_import_logs"   ON import_logs       TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_search_logs"   ON search_logs       TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_featured"      ON featured_sections TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_admin_actions" ON admin_actions     TO service_role USING (true) WITH CHECK (true);

-- Grant RPC function execution to anon (view increment is public)
GRANT EXECUTE ON FUNCTION increment_view(TEXT) TO anon;
