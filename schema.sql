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

-- ─────────────────────────────────────────
-- ARCHITECTURE V2 — INTELLIGENCE PIPELINE
-- Run this section after the base schema
-- ─────────────────────────────────────────

-- Content table: new enrichment columns
ALTER TABLE content ADD COLUMN IF NOT EXISTS primary_platform TEXT DEFAULT 'youtube';
ALTER TABLE content ADD COLUMN IF NOT EXISTS embed_url        TEXT;
ALTER TABLE content ADD COLUMN IF NOT EXISTS trailer_yt_id    TEXT;
ALTER TABLE content ADD COLUMN IF NOT EXISTS rating           NUMERIC(3,1);
ALTER TABLE content ADD COLUMN IF NOT EXISTS tags             TEXT[] DEFAULT '{}';
ALTER TABLE content ADD COLUMN IF NOT EXISTS source_count     INTEGER DEFAULT 1;

-- Staging table: n8n writes here, publisher promotes to content
CREATE TABLE IF NOT EXISTS discovery_candidates (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL DEFAULT 'youtube',
  platform_id     TEXT NOT NULL,
  title_raw       TEXT NOT NULL,
  title_ar        TEXT,
  type            TEXT DEFAULT 'film' CHECK (type IN ('film','series','episode')),
  origin          TEXT DEFAULT 'other',
  language        TEXT DEFAULT 'ar_dubbed',
  category        TEXT DEFAULT 'drama',
  year            INTEGER,
  duration_sec    INTEGER,
  poster_url      TEXT,
  embed_url       TEXT,
  embeddable      BOOLEAN DEFAULT true,
  quality_score   INTEGER DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  score_details   JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','pending_review','rejected','duplicate','published')),
  reject_reason   TEXT,
  series_title    TEXT,
  season          INTEGER,
  episode_num     INTEGER,
  keyword         TEXT,
  source_workflow TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  UNIQUE(platform, platform_id)
);

-- Self-adjusting keyword discovery queue
CREATE TABLE IF NOT EXISTS keyword_queue (
  id             SERIAL PRIMARY KEY,
  keyword        TEXT NOT NULL UNIQUE,
  lang           TEXT DEFAULT 'ar',
  category       TEXT DEFAULT 'drama',
  priority       INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  active         BOOLEAN DEFAULT true,
  last_run_at    TIMESTAMPTZ,
  run_count      INTEGER DEFAULT 0,
  total_found    INTEGER DEFAULT 0,
  total_imported INTEGER DEFAULT 0,
  success_rate   NUMERIC(5,2) DEFAULT 0.0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Provider health monitoring
CREATE TABLE IF NOT EXISTS provider_health (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT true,
  quota_status    TEXT DEFAULT 'ok' CHECK (quota_status IN ('ok','limited','exhausted','error')),
  last_success_at TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  error_count     INTEGER DEFAULT 0,
  daily_quota     INTEGER,
  used_today      INTEGER DEFAULT 0,
  notes           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-run keyword performance log
CREATE TABLE IF NOT EXISTS keyword_performance (
  id        SERIAL PRIMARY KEY,
  keyword   TEXT NOT NULL,
  platform  TEXT NOT NULL,
  run_at    TIMESTAMPTZ DEFAULT NOW(),
  found     INTEGER DEFAULT 0,
  imported  INTEGER DEFAULT 0,
  rejected  INTEGER DEFAULT 0,
  score_avg INTEGER DEFAULT 0
);

-- Multi-source support (multiple platforms per content item)
CREATE TABLE IF NOT EXISTS content_sources (
  id              SERIAL PRIMARY KEY,
  content_id      TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  episode_id      TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  platform_id     TEXT NOT NULL,
  embed_url       TEXT,
  source_url      TEXT,
  quality         TEXT DEFAULT 'hd',
  language        TEXT DEFAULT 'ar_dubbed',
  is_primary      BOOLEAN DEFAULT false,
  embeddable      BOOLEAN DEFAULT true,
  is_working      BOOLEAN DEFAULT true,
  active          BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, platform, platform_id)
);

-- Migrations for existing content_sources (idempotent)
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS episode_id      TEXT REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS source_url      TEXT;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS language        TEXT DEFAULT 'ar_dubbed';
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS is_working      BOOLEAN DEFAULT true;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

-- ─────────────────────────────────────────
-- RLS FOR NEW TABLES
-- ─────────────────────────────────────────

ALTER TABLE discovery_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health      ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_performance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_candidates" ON discovery_candidates;
DROP POLICY IF EXISTS "service_all_keywords"   ON keyword_queue;
DROP POLICY IF EXISTS "service_all_phealth"    ON provider_health;
DROP POLICY IF EXISTS "service_all_kperf"      ON keyword_performance;
DROP POLICY IF EXISTS "service_all_csources"   ON content_sources;
DROP POLICY IF EXISTS "public_read_csources"   ON content_sources;

CREATE POLICY "service_all_candidates" ON discovery_candidates TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_keywords"   ON keyword_queue        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_phealth"    ON provider_health      TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_kperf"      ON keyword_performance  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_csources"   ON content_sources      TO service_role USING (true) WITH CHECK (true);

-- Public can read active sources for active content
CREATE POLICY "public_read_csources"
  ON content_sources FOR SELECT TO anon
  USING (active = true AND embeddable = true AND EXISTS (
    SELECT 1 FROM content WHERE content.id = content_sources.content_id AND content.status = 'active'
  ));

-- ─────────────────────────────────────────
-- INDEXES FOR NEW TABLES
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_candidates_status   ON discovery_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_platform ON discovery_candidates(platform);
CREATE INDEX IF NOT EXISTS idx_candidates_created  ON discovery_candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_score    ON discovery_candidates(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_pid      ON discovery_candidates(platform, platform_id);
CREATE INDEX IF NOT EXISTS idx_keywords_priority   ON keyword_queue(priority DESC) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_keywords_last_run   ON keyword_queue(last_run_at ASC NULLS FIRST) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_phealth_enabled     ON provider_health(enabled);
CREATE INDEX IF NOT EXISTS idx_kperf_keyword       ON keyword_performance(keyword);
CREATE INDEX IF NOT EXISTS idx_kperf_run_at        ON keyword_performance(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_csources_content    ON content_sources(content_id);
CREATE INDEX IF NOT EXISTS idx_csources_platform   ON content_sources(platform);

-- ─────────────────────────────────────────
-- SEED: PROVIDER HEALTH
-- ─────────────────────────────────────────

INSERT INTO provider_health (id, name, enabled, daily_quota, notes) VALUES
  ('youtube',     'YouTube Data API v3',  true, 10000, 'Primary discovery source'),
  ('dailymotion', 'Dailymotion API',      true,  null, 'Secondary source, no hard quota'),
  ('archive',     'Archive.org',          true,  null, 'Public domain films'),
  ('vimeo',       'Vimeo API',            true,  5000, 'Embeddable public videos only'),
  ('tmdb',        'TMDB Metadata API',    true,  null, 'Metadata enrichment (poster, rating)'),
  ('omdb',        'OMDb API',             true,  1000, 'Fallback metadata, 1000/day free'),
  ('wikidata',    'Wikidata SPARQL',      true,  null, 'Multilingual titles and identifiers')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- SEED: KEYWORD QUEUE
-- ─────────────────────────────────────────

INSERT INTO keyword_queue (keyword, lang, category, priority) VALUES
  ('مسلسل تركي مدبلج بالعربية',    'ar', 'drama',       9),
  ('مسلسل هندي مدبلج عربي',        'ar', 'drama',       9),
  ('فيلم عربي كامل',               'ar', 'drama',       8),
  ('مسلسل كوري مترجم عربي',        'ar', 'drama',       8),
  ('مسلسل مغربي دارجة',            'ar', 'drama',       8),
  ('فيلم مغربي كامل',              'ar', 'drama',       7),
  ('مسلسل صيني مدبلج عربي',        'ar', 'drama',       7),
  ('فيلم هندي مدبلج عربي كامل',   'ar', 'action',      7),
  ('مسلسل تركي رومانسي مدبلج',    'ar', 'romance',     7),
  ('فيلم تركي كامل مدبلج',         'ar', 'drama',       7),
  ('أفلام أكشن عربية كاملة',       'ar', 'action',      6),
  ('مسلسلات رومانسية مدبلجة',      'ar', 'romance',     6),
  ('مسلسل عائلي مدبلج عربي',       'ar', 'family',      6),
  ('أفلام كوميدية مغربية',         'ar', 'comedy',      6),
  ('مسلسل تاريخي عربي كامل',       'ar', 'historical',  6),
  ('أفلام رعب مدبلجة',             'ar', 'horror',      5),
  ('مسلسلات خيال علمي مترجمة',    'ar', 'sci-fi',      5),
  ('أفلام وثائقية عربية',          'ar', 'documentary', 5),
  ('مسلسل جريمة مدبلج',            'ar', 'crime',       5),
  ('فيلم أنيميشن مدبلج عربي',      'ar', 'animation',   5),
  ('مسلسل باكستاني مدبلج',         'ar', 'drama',       4),
  ('مسلسل إيراني مدبلج عربي',      'ar', 'drama',       5),
  ('arabic dubbed film full movie', 'en', 'drama',       6),
  ('turkish series arabic dubbed',  'en', 'drama',       7),
  ('indian drama arabic dubbing',   'en', 'drama',       6),
  ('moroccan film darija full',     'en', 'drama',       6),
  ('korean drama arabic subtitles', 'en', 'drama',       5),
  ('arabic movie full hd free',     'en', 'drama',       6)
ON CONFLICT (keyword) DO NOTHING;

-- ─────────────────────────────────────────
-- ADDITIONAL SQL FUNCTIONS (V2 Pipeline)
-- ─────────────────────────────────────────

-- Refresh series status: active if has episodes, incomplete if 0
CREATE OR REPLACE FUNCTION refresh_series_status(p_content_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE content
  SET
    avail_eps = (SELECT COUNT(*) FROM episodes WHERE content_id = p_content_id),
    status = CASE
      WHEN (SELECT COUNT(*) FROM episodes WHERE content_id = p_content_id) > 0 THEN 'active'
      ELSE 'incomplete'
    END,
    updated_at = NOW()
  WHERE id = p_content_id AND type = 'series';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate quality_score from content_sources
CREATE OR REPLACE FUNCTION update_quality_score(p_content_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_working  INTEGER;
  v_total    INTEGER;
  v_score    INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE is_working = true AND embeddable = true),
    COUNT(*)
  INTO v_working, v_total
  FROM content_sources
  WHERE content_id = p_content_id AND active = true;

  v_score := CASE
    WHEN v_total = 0 THEN 0
    WHEN v_working = v_total THEN 100
    ELSE ROUND((v_working::NUMERIC / v_total) * 100)
  END;

  UPDATE content SET quality_score = v_score, updated_at = NOW()
  WHERE id = p_content_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark a content_source as dead (not working)
CREATE OR REPLACE FUNCTION mark_source_dead(p_source_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE content_sources
  SET is_working = false, last_checked_at = NOW()
  WHERE id = p_source_id;

  -- Update quality score for parent content
  PERFORM update_quality_score(content_id)
  FROM content_sources WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically publish a candidate to content table
CREATE OR REPLACE FUNCTION publish_candidate(p_candidate_id TEXT)
RETURNS TEXT AS $$
DECLARE
  c          discovery_candidates%ROWTYPE;
  v_content_id TEXT;
  v_ytid       TEXT;
  v_status     TEXT;
BEGIN
  SELECT * INTO c FROM discovery_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate % not found', p_candidate_id; END IF;
  IF c.status NOT IN ('approved', 'pending_review') THEN
    RAISE EXCEPTION 'Candidate status is %, must be approved or pending_review', c.status;
  END IF;

  v_content_id := c.platform || '_' || c.platform_id;
  v_ytid := CASE WHEN c.platform = 'archive' THEN 'arc_' || c.platform_id ELSE c.platform_id END;
  v_status := CASE WHEN c.quality_score >= 85 THEN 'active' ELSE 'pending' END;

  INSERT INTO content (
    id, type, title_ar, language, origin, category,
    poster_url, yt_id, year, duration_sec, embeddable,
    quality_score, primary_platform, status, source_count
  ) VALUES (
    v_content_id, c.type, COALESCE(c.title_ar, c.title_raw), c.language, c.origin, c.category,
    c.poster_url, v_ytid, c.year, c.duration_sec, true,
    c.quality_score, c.platform, v_status, 1
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE discovery_candidates SET status = 'published' WHERE id = p_candidate_id;
  RETURN v_content_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Merge a duplicate candidate into an existing content item (adds as alternate source)
CREATE OR REPLACE FUNCTION merge_duplicate_candidate(p_candidate_id TEXT, p_target_content_id TEXT)
RETURNS VOID AS $$
DECLARE
  c discovery_candidates%ROWTYPE;
BEGIN
  SELECT * INTO c FROM discovery_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate % not found', p_candidate_id; END IF;

  -- Add as an alternate source if not already present
  INSERT INTO content_sources (content_id, platform, platform_id, embed_url, is_primary, embeddable, is_working)
  VALUES (p_target_content_id, c.platform, c.platform_id, c.embed_url, false, c.embeddable, true)
  ON CONFLICT (content_id, platform, platform_id) DO NOTHING;

  -- Increment source_count on target
  UPDATE content SET source_count = COALESCE(source_count, 1) + 1, updated_at = NOW()
  WHERE id = p_target_content_id;

  UPDATE discovery_candidates SET status = 'duplicate' WHERE id = p_candidate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for content_sources episode_id
CREATE INDEX IF NOT EXISTS idx_csources_episode   ON content_sources(episode_id);
CREATE INDEX IF NOT EXISTS idx_csources_working   ON content_sources(is_working) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_csources_checked   ON content_sources(last_checked_at);

-- ─────────────────────────────────────────
-- ARCHITECTURE V3 — SEASONS + MULTI-SOURCE
-- ─────────────────────────────────────────

-- Seasons: group episodes by season within a series
CREATE TABLE IF NOT EXISTS seasons (
  id             TEXT PRIMARY KEY,
  content_id     TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  season_number  INTEGER NOT NULL DEFAULT 1,
  title          TEXT,
  poster_url     TEXT,
  episode_count  INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, season_number)
);

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_seasons" ON seasons;
DROP POLICY IF EXISTS "public_read_seasons"  ON seasons;

CREATE POLICY "service_all_seasons" ON seasons TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_seasons"
  ON seasons FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM content
    WHERE content.id = seasons.content_id AND content.status = 'active'
  ));

CREATE INDEX IF NOT EXISTS idx_seasons_content ON seasons(content_id);

-- Trigger to auto-update seasons.updated_at
DROP TRIGGER IF EXISTS trg_seasons_updated ON seasons;
CREATE TRIGGER trg_seasons_updated
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add source_id to dead_links (link report to a specific source)
ALTER TABLE dead_links ADD COLUMN IF NOT EXISTS source_id INTEGER REFERENCES content_sources(id) ON DELETE SET NULL;

-- Fix publish_candidate: also insert content_sources row
CREATE OR REPLACE FUNCTION publish_candidate(p_candidate_id TEXT)
RETURNS TEXT AS $$
DECLARE
  c            discovery_candidates%ROWTYPE;
  v_content_id TEXT;
  v_ytid       TEXT;
  v_status     TEXT;
  v_embed_url  TEXT;
BEGIN
  SELECT * INTO c FROM discovery_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate % not found', p_candidate_id; END IF;
  IF c.status NOT IN ('approved', 'pending_review') THEN
    RAISE EXCEPTION 'Candidate status is %, must be approved or pending_review', c.status;
  END IF;

  -- Skip episodes (handled by publish.js server-side which guarantees parent)
  IF c.type = 'episode' THEN
    RAISE EXCEPTION 'Episodes must be published via publish.js, not publish_candidate()';
  END IF;

  v_content_id := c.platform || '_' || c.platform_id;
  v_ytid := CASE WHEN c.platform = 'archive' THEN 'arc_' || c.platform_id ELSE c.platform_id END;
  v_status := CASE WHEN c.quality_score >= 85 THEN 'active' ELSE 'pending' END;

  v_embed_url := CASE c.platform
    WHEN 'youtube'     THEN 'https://www.youtube.com/embed/' || c.platform_id || '?rel=0&modestbranding=1'
    WHEN 'dailymotion' THEN 'https://www.dailymotion.com/embed/video/' || c.platform_id
    WHEN 'vimeo'       THEN 'https://player.vimeo.com/video/' || c.platform_id
    WHEN 'archive'     THEN 'https://archive.org/embed/' || c.platform_id
    ELSE c.embed_url
  END;

  -- Insert content (idempotent)
  INSERT INTO content (
    id, type, title_ar, language, origin, category,
    poster_url, yt_id, year, duration_sec, embeddable,
    quality_score, primary_platform, status, source_count
  ) VALUES (
    v_content_id, c.type, COALESCE(c.title_ar, c.title_raw), c.language, c.origin, c.category,
    c.poster_url, v_ytid, c.year, c.duration_sec, true,
    c.quality_score, c.platform, v_status, 1
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert primary source
  INSERT INTO content_sources (content_id, platform, platform_id, embed_url, source_url, is_primary, embeddable, is_working, last_checked_at)
  VALUES (v_content_id, c.platform, c.platform_id, v_embed_url, c.embed_url, true, true, true, NOW())
  ON CONFLICT (content_id, platform, platform_id) DO NOTHING;

  UPDATE discovery_candidates SET status = 'published' WHERE id = p_candidate_id;
  RETURN v_content_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update report_dead_link to accept optional source_id
CREATE OR REPLACE FUNCTION report_dead_link(p_content_id TEXT, p_yt_id TEXT, p_source_id INTEGER DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE v_reports INTEGER;
BEGIN
  INSERT INTO dead_links (content_id, yt_id, source_id, reports)
  VALUES (p_content_id, p_yt_id, p_source_id, 1)
  ON CONFLICT (content_id, yt_id) DO UPDATE
    SET reports = dead_links.reports + 1,
        source_id = COALESCE(p_source_id, dead_links.source_id);

  SELECT reports INTO v_reports
  FROM dead_links
  WHERE content_id = p_content_id AND yt_id IS NOT DISTINCT FROM p_yt_id;

  -- Mark source as not working if source_id provided
  IF p_source_id IS NOT NULL AND v_reports >= 2 THEN
    UPDATE content_sources SET is_working = false, last_checked_at = NOW()
    WHERE id = p_source_id;
  END IF;

  -- Auto-hide content after 3+ reports (only if no working sources remain)
  IF v_reports >= 3 AND p_content_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM content_sources
      WHERE content_id = p_content_id AND is_working = true AND active = true
    ) THEN
      UPDATE content SET status = 'hidden' WHERE id = p_content_id;
    END IF;
  END IF;

  RETURN v_reports;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── V4: content_sources reliability tracking ──────────────────
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS last_error_reason TEXT;

-- Unique index for dead_links per source
CREATE UNIQUE INDEX IF NOT EXISTS dead_links_source_unique
  ON dead_links(source_id)
  WHERE source_id IS NOT NULL;
