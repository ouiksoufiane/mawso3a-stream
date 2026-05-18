const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

function slugifySeries(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 ^ name.charCodeAt(i)) >>> 0;
  const safe = name.replace(/\s+/g, '_').replace(/[^؀-ۿa-zA-Z0-9_]/g, '').slice(0, 35);
  return `series_${safe}_${h.toString(36).slice(0, 5)}`;
}

function embedUrlForPlatform(platform, platformId) {
  switch (platform) {
    case 'youtube':     return `https://www.youtube.com/embed/${platformId}?rel=0&modestbranding=1`;
    case 'dailymotion': return `https://www.dailymotion.com/embed/video/${platformId}`;
    case 'vimeo':       return `https://player.vimeo.com/video/${platformId}`;
    case 'archive':     return `https://archive.org/embed/${platformId}`;
    default:            return null;
  }
}

// Quality scoring: score >= 85 → active, 60-84 → pending_review, < 60 → rejected
function scoreCandidate(c) {
  // Hard reject: not embeddable
  if (c.embeddable === false) return { score: 0, reject: true, reason: 'not_embeddable' };

  const isFilm = c.type === 'film';
  const minDur = isFilm ? 2100 : 900; // 35min for films, 15min for episodes

  // Hard reject: trailer or short clip
  if (c.duration_sec && c.duration_sec < minDur) {
    return { score: 0, reject: true, reason: 'too_short' };
  }

  const d = {};
  let s = 0;

  s += 25; d.embeddable = 25;                                                 // confirmed embeddable
  if (c.duration_sec >= minDur)               { s += 20; d.duration = 20; }  // proper length
  if (c.title_ar && c.title_ar.trim().length >= 3) { s += 15; d.title_ar = 15; } // has Arabic title
  if (c.poster_url)                           { s += 10; d.poster = 10; }    // has thumbnail
  if (c.year && c.year >= 1940 && c.year <= new Date().getFullYear() + 1) { s += 8; d.year = 8; }
  if (c.language && c.language !== 'unknown') { s += 6; d.language = 6; }   // known language
  if (c.origin && c.origin !== 'other')       { s += 6; d.origin = 6; }     // known origin
  if (c.category)                             { s += 4; d.category = 4; }   // has category
  if (c.platform === 'youtube')               { s += 6; d.platform_trust = 6; } // trusted platform

  return { score: Math.min(s, 100), reject: false, reason: null, details: d };
}

async function sb(method, path, body, key) {
  const res = await fetch(`${SB_URL}/${path}`, {
    method,
    headers: {
      'apikey': key, 'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function sbCount(path, key) {
  const res = await fetch(`${SB_URL}/${path}`, {
    headers: {
      'apikey': key, 'Authorization': `Bearer ${key}`,
      'Prefer': 'count=exact', 'Range': '0-0'
    }
  });
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0') || 0;
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET = process.env.N8N_SECRET;
  const SVC = process.env.SUPABASE_SERVICE_KEY;
  if (!N8N_SECRET || !SVC) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query.action || req.body?.action || '';

  // ── SCORE pending candidates ─────────────────────────────────────────────
  if (req.method === 'POST' && action === 'score') {
    const { limit = 100 } = req.body || {};
    const r = await sb('GET',
      `discovery_candidates?status=eq.pending&limit=${Math.min(+limit, 300)}&order=created_at.asc&select=*`,
      null, SVC);
    const candidates = Array.isArray(r.data) ? r.data : [];

    let scored = 0, rejected = 0, dupes = 0;
    for (const c of candidates) {
      // Check duplicate in content table by platform_id
      const dupR = await sb('GET', `content?yt_id=eq.${encodeURIComponent(c.platform_id)}&limit=1&select=id`, null, SVC);
      if (Array.isArray(dupR.data) && dupR.data.length > 0) {
        await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`, {
          status: 'duplicate', reject_reason: 'already_in_content',
          reviewed_at: new Date().toISOString()
        }, SVC);
        dupes++;
        continue;
      }

      const { score, reject, reason, details } = scoreCandidate(c);
      if (reject) {
        await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`, {
          status: 'rejected', quality_score: 0, reject_reason: reason,
          score_details: details || {}, reviewed_at: new Date().toISOString()
        }, SVC);
        rejected++;
      } else {
        const newStatus = score >= 85 ? 'approved' : (score >= 60 ? 'pending_review' : 'rejected');
        await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`, {
          status: newStatus, quality_score: score,
          score_details: details || {}, reviewed_at: new Date().toISOString(),
          ...(newStatus === 'rejected' ? { reject_reason: 'low_score' } : {})
        }, SVC);
        if (newStatus === 'rejected') rejected++;
        else scored++;
      }
    }

    return res.json({ ok: true, processed: candidates.length, scored, rejected, dupes });
  }

  // ── PUBLISH approved + pending_review → content table ───────────────────
  if (req.method === 'POST' && action === 'publish') {
    const { limit = 50, include_pending_review = false } = req.body || {};
    const statusFilter = include_pending_review
      ? 'status=in.(approved,pending_review)'
      : 'status=eq.approved';
    const r = await sb('GET',
      `discovery_candidates?${statusFilter}&limit=${Math.min(+limit, 150)}&order=quality_score.desc&select=*`,
      null, SVC);
    const candidates = Array.isArray(r.data) ? r.data : [];

    let published = 0, errors = 0, skipped = 0;
    for (const c of candidates) {
      try {
        const targetStatus = c.quality_score >= 85 ? 'active' : 'pending';
        const platform = c.platform || 'youtube';
        const ytId = platform === 'archive' ? `arc_${c.platform_id}` : c.platform_id;

        if (c.type === 'film') {
          const contentId = `${platform}_${c.platform_id}`;
          const defaultPoster = platform === 'archive'
            ? `https://archive.org/services/img/${c.platform_id}`
            : `https://img.youtube.com/vi/${c.platform_id}/hqdefault.jpg`;

          const content = {
            id: contentId,
            type: 'film',
            title_ar: (c.title_ar || c.title_raw).slice(0, 200),
            language: c.language || 'ar_dubbed',
            origin: c.origin || 'other',
            category: c.category || 'drama',
            poster_url: c.poster_url || defaultPoster,
            yt_id: ytId,
            year: c.year || null,
            duration_sec: c.duration_sec || null,
            embeddable: true,
            quality_score: c.quality_score || 0,
            primary_platform: platform,
            status: targetStatus,
            source_count: 1
          };

          const ins = await sb('POST', 'content', content, SVC);
          if (ins.ok) {
            // Create primary content_source row
            await sb('POST', 'content_sources', {
              content_id: contentId,
              platform,
              platform_id: c.platform_id,
              embed_url: embedUrlForPlatform(platform, c.platform_id),
              source_url: c.source_url || null,
              is_primary: true,
              embeddable: true,
              is_working: true,
              last_checked_at: new Date().toISOString()
            }, SVC);
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'published' }, SVC);
            published++;
          } else if (ins.status === 409) {
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'duplicate' }, SVC);
            skipped++;
          } else {
            errors++;
          }

        } else if (c.type === 'series') {
          const contentId = `${platform}_${c.platform_id}`;
          const content = {
            id: contentId,
            type: 'series',
            title_ar: (c.title_ar || c.title_raw).slice(0, 200),
            language: c.language || 'ar_dubbed',
            origin: c.origin || 'other',
            category: c.category || 'drama',
            poster_url: c.poster_url || `https://img.youtube.com/vi/${c.platform_id}/hqdefault.jpg`,
            yt_id: ytId,
            year: c.year || null,
            embeddable: true,
            quality_score: c.quality_score || 0,
            primary_platform: platform,
            status: targetStatus,
            source_count: 1
          };

          const ins = await sb('POST', 'content', content, SVC);
          if (ins.ok) {
            // Create primary content_source row
            await sb('POST', 'content_sources', {
              content_id: contentId,
              platform,
              platform_id: c.platform_id,
              embed_url: embedUrlForPlatform(platform, c.platform_id),
              source_url: c.source_url || null,
              is_primary: true,
              embeddable: true,
              is_working: true,
              last_checked_at: new Date().toISOString()
            }, SVC);
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'published' }, SVC);
            published++;
          } else if (ins.status === 409) {
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'duplicate' }, SVC);
            skipped++;
          } else {
            errors++;
          }

        } else if (c.type === 'episode' && c.series_title) {
          const seriesKey = c.series_title.toLowerCase().trim();
          const seriesId = slugifySeries(seriesKey);
          const epId = `ep_${platform}_${c.platform_id}`;
          const seasonNum = c.season || 1;

          // Guarantee parent series exists before inserting episode
          const seriesCheck = await sb('GET',
            `content?id=eq.${encodeURIComponent(seriesId)}&limit=1&select=id`, null, SVC);
          if (!Array.isArray(seriesCheck.data) || seriesCheck.data.length === 0) {
            const defaultPoster = platform === 'archive'
              ? `https://archive.org/services/img/${c.platform_id}`
              : `https://img.youtube.com/vi/${c.platform_id}/hqdefault.jpg`;
            await sb('POST', 'content', {
              id: seriesId,
              type: 'series',
              title_ar: c.series_title.slice(0, 200),
              language: c.language || 'ar_dubbed',
              origin: c.origin || 'other',
              category: c.category || 'drama',
              poster_url: c.poster_url || defaultPoster,
              yt_id: ytId,
              embeddable: true,
              quality_score: 60,
              primary_platform: platform,
              status: 'active',
              source_count: 0
            }, SVC);
          }

          // Upsert season row
          const seasonId = `${seriesId}_s${seasonNum}`;
          await sb('POST', 'seasons', {
            id: seasonId,
            content_id: seriesId,
            season_number: seasonNum
          }, SVC);

          const ep = {
            id: epId,
            content_id: seriesId,
            season: seasonNum,
            episode: c.episode_num || 1,
            title_ar: (c.title_ar || c.title_raw || '').slice(0, 200),
            yt_id: ytId,
            duration_sec: c.duration_sec || null,
            embeddable: true,
            source: platform
          };

          const ins = await sb('POST', 'episodes', ep, SVC);
          if (ins.ok) {
            // Create content_source for this episode
            await sb('POST', 'content_sources', {
              content_id: seriesId,
              episode_id: epId,
              platform,
              platform_id: c.platform_id,
              embed_url: embedUrlForPlatform(platform, c.platform_id),
              source_url: c.source_url || null,
              is_primary: true,
              embeddable: true,
              is_working: true,
              last_checked_at: new Date().toISOString()
            }, SVC);
            await fetch(`${SB_URL}/rpc/refresh_avail_eps`, {
              method: 'POST',
              headers: { 'apikey': SVC, 'Authorization': `Bearer ${SVC}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_content_id: seriesId })
            }).catch(() => {});
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'published' }, SVC);
            published++;
          } else if (ins.status === 409) {
            await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(c.id)}`,
              { status: 'duplicate' }, SVC);
            skipped++;
          } else {
            errors++;
          }
        }
      } catch(e) {
        console.error('publish error:', c.id, e.message);
        errors++;
      }
    }

    return res.json({ ok: true, processed: candidates.length, published, skipped, errors });
  }

  // ── STATS ────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'stats') {
    const statuses = ['pending','approved','pending_review','rejected','duplicate','published'];
    const counts = await Promise.all(
      statuses.map(s => sbCount(`discovery_candidates?status=eq.${s}`, SVC)
        .then(n => [s, n]))
    );
    return res.json({ ok: true, stats: Object.fromEntries(counts) });
  }

  // ── GET NEXT KEYWORDS to process ────────────────────────────────────────
  if (req.method === 'GET' && action === 'next-keywords') {
    const { limit = 5 } = req.query;
    const r = await sb('GET',
      `keyword_queue?active=eq.true&order=priority.desc,last_run_at.asc.nullsfirst&limit=${Math.min(+limit, 20)}&select=id,keyword,lang,category,priority`,
      null, SVC);
    return res.json({ ok: true, keywords: r.data || [] });
  }

  return res.status(404).json({ error: `Unknown action: ${action}` });
}
