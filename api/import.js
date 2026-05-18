const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

async function sb(method, path, body, serviceKey) {
  const res = await fetch(`${SB_URL}/${path}`, {
    method,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal,resolution=ignore-duplicates'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}

async function sbRpc(fn, args, serviceKey) {
  const res = await fetch(`${SB_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  return res.ok;
}

function detectOrigin(title) {
  const t = (title || '').toLowerCase();
  if (/تركي|türk|turkish|تركية|إسطنبول|اسطنبول|istanbul|أناضول|aşk|safir|hatasız/.test(t)) return 'turkish';
  if (/هندي|hindi|bollywood|بوليوود|هندية|هندى|kareena|kapoor|aamir|salman|shahrukh|deepika|hrithik|baahubali|أميتاب|شاروخان/.test(t)) return 'indian';
  if (/كوري|korean|كورية|k-drama|kdrama|أسطورة البحر الأزرق/.test(t)) return 'korean';
  if (/أمريكي|american|هوليوود|hollywood|أمريكية|vin diesel|فين ديزل|رامبو|rambo/.test(t)) return 'american';
  if (/مغربي|مغرب|maroc|darija|دارجة|مغربية|برامج رمضان/.test(t)) return 'moroccan';
  if (/فرنسي|français|france/.test(t)) return 'french';
  if (/【|】/.test(title)) return 'chinese';
  if (/\bceo\b/.test(t) && /(حب|زواج|فتا|زوجة|فقيرة|ملياردير|مليونير)/.test(t)) return 'chinese';
  if (/(ملياردير|مليونير).{0,50}(وقع|يقع|يحب|زواج)/.test(t)) return 'chinese';
  if (/(فتاة|فتيات).{0,50}(ملياردير|مليونير|ceo)/.test(t)) return 'chinese';
  return 'other';
}
function detectLanguage(title) {
  const t = (title || '').toLowerCase();
  if (/دارجة|darija|مغربي/.test(t))           return 'darija';
  if (/français|فرنسي|مدبلج بالفرنس/.test(t))  return 'fr_dubbed';
  return 'ar_dubbed';
}
function detectCategory(title) {
  const t = (title || '').toLowerCase();
  if (/رعب|horror/.test(t))               return 'horror';
  if (/أكشن|action/.test(t))             return 'action';
  if (/كوميدي|comedy/.test(t))           return 'comedy';
  if (/رومانسي|romance/.test(t))         return 'romance';
  if (/خيال علمي|sci-fi|science fiction/.test(t)) return 'sci-fi';
  if (/وثائقي|documentary/.test(t))      return 'documentary';
  if (/أنيمي|anime/.test(t))             return 'anime';
  return 'drama';
}

function cleanTitle(title) {
  return (title || '')
    .replace(/\s*\|\s*.*/g, '')
    .replace(/\s*[-–]\s*(مدبلج|dubbed|sub|vf|vostfr|hd|4k|full|كامل|مترجم).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200);
}

function isTrailerOrShort(title, durationSec) {
  const t = (title || '').toLowerCase();
  if (durationSec && durationSec < 600) return true;
  if (/trailer|teaser|clip|بروموشن|إعلان|promo|preview|teasar/.test(t)) return true;
  return false;
}

// Extract the series name from an episode title
function extractSeriesName(title) {
  return (title || '')
    .replace(/\s*(الحلقة|حلقة|ح\.?|ep\.?|episode)\s*\d+.*/gi, '')
    .replace(/\s*(الموسم|سيزون|season|الجزء|جزء|part)\s*\d+.*/gi, '')
    .replace(/\s*\d+\s*$/, '')
    .replace(/\s*(hd|4k|fhd|1080p|720p|مدبلج|مترجم|كامل|مكتمل|dubbed|sub|vf)\s*/gi, '')
    .replace(/\s*(trailer|teaser|clip|إعلان|بروموشن)\s*/gi, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*[-–—]\s*(?:مدبلج|dubbed|sub|vf|hd|4k).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 150);
}

// Stable series slug: Arabic-safe + short hash to avoid collisions
function slugifySeries(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 ^ name.charCodeAt(i)) >>> 0;
  const safe = name.replace(/\s+/g, '_').replace(/[^؀-ۿa-zA-Z0-9_]/g, '').slice(0, 35);
  return `${safe}_${h.toString(36).slice(0, 5)}`;
}

// Extract episode number from title
function extractEpisodeNumber(title) {
  const t = title || '';
  const m = t.match(/(?:الحلقة|حلقة|ح|ep\.?|episode)\s*(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

// Extract season number from title
function extractSeasonNumber(title) {
  const t = title || '';
  const m = t.match(/(?:الموسم|سيزون|season|الجزء|جزء|part)\s*(\d+)/i);
  return m ? parseInt(m[1]) : 1;
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET       = process.env.N8N_SECRET;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  const YOUTUBE_API_KEY  = process.env.YOUTUBE_API_KEY;

  if (!N8N_SECRET) return res.status(500).json({ error: 'Server config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action;

  // ── STATUS ────────────────────────────────────────
  if (action === 'status') {
    return res.json({
      ok: true,
      env: { youtube: !!YOUTUBE_API_KEY, supabase: !!SUPABASE_SERVICE },
      version: '3.0'
    });
  }

  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });

  // ── SEARCH YOUTUBE ────────────────────────────────
  if (req.method === 'POST' && action === 'search-youtube') {
    if (!YOUTUBE_API_KEY) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });
    const { query, max = 20, content_type = 'film' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });

    const minDuration = content_type === 'film' ? '&videoDuration=long' : '';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${Math.min(max,50)}${minDuration}&relevanceLanguage=ar&key=${YOUTUBE_API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'YouTube API error', code: data?.error?.code });

    const ids = (data.items || []).map(i => i.id.videoId).filter(Boolean).join(',');
    let details = {};
    if (ids) {
      const dr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ids}&key=${YOUTUBE_API_KEY}`);
      const dd = await dr.json();
      (dd.items || []).forEach(v => {
        const iso = v.contentDetails?.duration || '';
        const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const sec = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
        details[v.id] = { duration_sec: sec, embeddable: v.status?.embeddable !== false };
      });
    }

    const results = (data.items || [])
      .map(item => {
        const ytId = item.id.videoId;
        const title = item.snippet.title;
        const d = details[ytId] || {};
        return {
          ytId, title,
          title_ar: cleanTitle(title),
          poster_url: item.snippet.thumbnails?.medium?.url,
          description: (item.snippet.description || '').slice(0, 500),
          origin:   detectOrigin(title),
          language: detectLanguage(title),
          category: detectCategory(title),
          duration_sec: d.duration_sec || null,
          embeddable: d.embeddable !== false,
          year: new Date(item.snippet.publishedAt).getFullYear(),
          is_trailer: isTrailerOrShort(title, d.duration_sec)
        };
      })
      .filter(r => !r.is_trailer);

    return res.json({ ok: true, results, total: results.length });
  }

  // ── IMPORT FILM ───────────────────────────────────
  if (req.method === 'POST' && action === 'import-film') {
    const { ytId, title_ar, origin, language, category, year, duration_sec, description, poster_url, embeddable } = req.body || {};
    if (!ytId || !title_ar) return res.status(400).json({ error: 'ytId and title_ar required' });
    const isArchive = ytId.startsWith('arc_');
    const id = `film_${ytId}`;
    const defaultPoster = isArchive
      ? `https://archive.org/services/img/${ytId.slice(4)}`
      : `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    const r = await sb('POST', 'content', {
      id, type: 'film',
      title_ar:     cleanTitle(title_ar),
      origin:       origin    || detectOrigin(title_ar),
      language:     language  || detectLanguage(title_ar),
      category:     category  || detectCategory(title_ar),
      yt_id:        ytId,
      poster_url:   poster_url || defaultPoster,
      year:         year || null,
      duration_sec: duration_sec || null,
      description:  (description || '').slice(0, 1000) || null,
      embeddable:   embeddable !== false,
      status:       'active',
      quality_score: 0
    }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── IMPORT SERIES (manual, explicit id) ───────────
  if (req.method === 'POST' && action === 'import-series') {
    let { id, title_ar, title_orig, origin, language, category, total_eps, poster_url, description, year } = req.body || {};
    if (!title_ar) return res.status(400).json({ error: 'title_ar required' });
    // Sanitize explicit id; fall back to slugifySeries so Arabic titles get stable IDs
    const rawId = (id || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    id = rawId ? (rawId.startsWith('series_') ? rawId : `series_${rawId}`) : slugifySeries(title_ar);
    const r = await sb('POST', 'content', {
      id, type: 'series',
      title_ar:    cleanTitle(title_ar),
      title_orig:  title_orig || null,
      origin:      origin   || 'other',
      language:    language || 'ar_dubbed',
      category:    category || 'drama',
      total_eps:   total_eps || 0,
      avail_eps:   0,
      poster_url:  poster_url || null,
      description: (description || '').slice(0, 1000) || null,
      year:        year || null,
      status:      'active',
      quality_score: 0
    }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── SMART IMPORT EPISODE (auto group by series name) ──
  if (req.method === 'POST' && action === 'smart-import-episode') {
    const { ytId, raw_title, series_title, title, season: rawSeason, episode: rawEp, duration_sec, embeddable, source, poster_url } = req.body || {};
    const rawT = raw_title || title || '';
    if (!ytId || !rawT) return res.status(400).json({ error: 'ytId and raw_title (or title) required' });

    // Use explicit series_title if provided, else extract from raw_title
    const seriesName = (series_title && series_title.trim().length >= 2)
      ? series_title.trim().slice(0, 150)
      : extractSeriesName(rawT);
    if (!seriesName) return res.status(400).json({ error: 'Could not determine series name' });

    const slug = slugifySeries(seriesName);
    const series_id = `series_${slug}`;
    const season = rawSeason || extractSeasonNumber(rawT);
    const episode = rawEp || extractEpisodeNumber(rawT);

    // Check if series exists, create if not
    const checkRes = await sb('GET', `content?id=eq.${encodeURIComponent(series_id)}&select=id`, null, SUPABASE_SERVICE);
    const exists = Array.isArray(checkRes.data) && checkRes.data.length > 0;

    if (!exists) {
      await sb('POST', 'content', {
        id: series_id,
        type: 'series',
        title_ar: seriesName,
        origin:   detectOrigin(rawT),
        language: detectLanguage(rawT),
        category: detectCategory(rawT),
        poster_url: poster_url || `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
        avail_eps: 0,
        total_eps: 0,
        status: 'active',
        quality_score: 0
      }, SUPABASE_SERVICE);
    }

    // Insert episode (ignore duplicate by yt_id)
    const epId = `ep_${ytId}`;
    const r = await sb('POST', 'episodes', {
      id: epId,
      content_id:   series_id,
      yt_id:        ytId,
      title_ar:     cleanTitle(rawT),
      season:       season,
      episode:      episode,
      duration_sec: duration_sec || null,
      embeddable:   embeddable !== false,
      source:       source || 'youtube'
    }, SUPABASE_SERVICE);

    if (r.ok) {
      await sbRpc('refresh_avail_eps', { p_content_id: series_id }, SUPABASE_SERVICE).catch(() => {});
    }

    return res.json({ ok: r.ok, series_id, episode_id: epId, series_name: seriesName, season, episode });
  }

  // ── IMPORT EPISODE (legacy, explicit series_id) ───
  if (req.method === 'POST' && action === 'import-episode') {
    const { ytId, series_id, title_ar, season = 1, episode, duration_sec, embeddable, source } = req.body || {};
    if (!ytId || !series_id) return res.status(400).json({ error: 'ytId and series_id required' });
    const id = `ep_${ytId}`;
    const r = await sb('POST', 'episodes', {
      id, content_id: series_id, yt_id: ytId,
      title_ar:     title_ar || null,
      season:       season || 1,
      episode:      episode || null,
      duration_sec: duration_sec || null,
      embeddable:   embeddable !== false,
      source:       source || null
    }, SUPABASE_SERVICE);
    if (r.ok) {
      await sbRpc('refresh_avail_eps', { p_content_id: series_id }, SUPABASE_SERVICE).catch(() => {});
    }
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── IMPORT BATCH ──────────────────────────────────
  if (req.method === 'POST' && action === 'import-batch') {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items[] required' });

    let imported = 0, skipped = 0, errors = 0;
    for (const item of items.slice(0, 100)) {
      try {
        if (!item.ytId) { errors++; continue; }
        const id = `film_${item.ytId}`;
        const title = cleanTitle(item.title_ar || item.title || item.ytId);
        const r = await sb('POST', 'content', {
          id, type: 'film', title_ar: title,
          origin:       item.origin   || detectOrigin(title),
          language:     item.language || detectLanguage(title),
          category:     item.category || detectCategory(title),
          yt_id:        item.ytId,
          poster_url:   item.poster_url || `https://img.youtube.com/vi/${item.ytId}/mqdefault.jpg`,
          year:         item.year        || null,
          duration_sec: item.duration_sec || null,
          description:  (item.description || '').slice(0, 1000) || null,
          embeddable:   item.embeddable !== false,
          status:       'active',
          quality_score: 0
        }, SUPABASE_SERVICE);
        r.status === 409 ? skipped++ : r.ok ? imported++ : errors++;
      } catch { errors++; }
    }

    await sb('POST', 'discovery_log', {
      query: (items[0]?.query || 'batch').slice(0, 200),
      found: items.length, imported, skipped
    }, SUPABASE_SERVICE).catch(() => {});

    return res.json({ ok: true, imported, skipped, errors, total: items.length });
  }

  // ── VERIFY LINKS ──────────────────────────────────
  if (req.method === 'POST' && action === 'verify') {
    const { ytIds } = req.body || {};
    if (!Array.isArray(ytIds) || !ytIds.length) return res.status(400).json({ error: 'ytIds[] required' });

    const results = await Promise.allSettled(
      ytIds.slice(0, 50).map(async ytId => {
        try {
          const r = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${ytId}&format=json`, { signal: AbortSignal.timeout(5000) });
          return { ytId, alive: r.ok };
        } catch {
          return { ytId, alive: false };
        }
      })
    );

    const dead = results.filter(r => r.status === 'fulfilled' && !r.value.alive).map(r => r.value.ytId);

    if (req.body.auto_hide && dead.length) {
      for (const ytId of dead) {
        await sb('PATCH', `content?yt_id=eq.${encodeURIComponent(ytId)}&status=eq.active`,
          { status: 'hidden' }, SUPABASE_SERVICE).catch(() => {});
        await sb('PATCH', `episodes?yt_id=eq.${encodeURIComponent(ytId)}`,
          { embeddable: false }, SUPABASE_SERVICE).catch(() => {});
      }
    }

    return res.json({ ok: true, checked: ytIds.length, alive: ytIds.length - dead.length, dead, dead_count: dead.length });
  }

  // ── LOG ───────────────────────────────────────────
  if (req.method === 'POST' && action === 'log') {
    const { query, found = 0, imported = 0, skipped = 0 } = req.body || {};
    await sb('POST', 'discovery_log', { query: (query || '').slice(0, 200), found, imported, skipped }, SUPABASE_SERVICE);
    return res.json({ ok: true });
  }

  return res.status(404).json({ error: `Unknown action: ${action || '(none)'}` });
}
