const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

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
  const data = text ? JSON.parse(text).catch?.(() => text) ?? text : null;
  return { ok: res.ok, status: res.status, data };
}

function detectOrigin(title) {
  const t = title.toLowerCase();
  if (/تركي|türk|turkish/.test(t))                    return 'turkish';
  if (/هندي|hindi|bollywood|بوليوود/.test(t))          return 'indian';
  if (/كوري|korean/.test(t))                           return 'korean';
  if (/أمريكي|american|english/.test(t))               return 'american';
  if (/مغربي|مغرب|maroc|darija|دارجة/.test(t))         return 'moroccan';
  return 'other';
}
function detectLanguage(title) {
  const t = title.toLowerCase();
  if (/دارجة|darija|مغربي/.test(t))          return 'darija';
  if (/français|فرنسي|مدبلج بالفرنس/.test(t)) return 'fr_dubbed';
  return 'ar_dubbed';
}
function detectCategory(title) {
  const t = title.toLowerCase();
  if (/رعب|horror/.test(t))                 return 'horror';
  if (/أكشن|action/.test(t))               return 'action';
  if (/كوميدي|comedy/.test(t))             return 'comedy';
  if (/رومانسي|romance|حب/.test(t))        return 'romance';
  if (/خيال علمي|sci-fi|science fiction/.test(t)) return 'sci-fi';
  return 'drama';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET       = process.env.N8N_SECRET;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  const YOUTUBE_API_KEY  = process.env.YOUTUBE_API_KEY;

  const auth = req.headers['authorization'] || '';
  if (!N8N_SECRET || auth !== `Bearer ${N8N_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action;

  // ── STATUS ────────────────────────────────────────
  if (action === 'status') {
    return res.json({
      status: 'ok',
      env: { youtube: !!YOUTUBE_API_KEY, supabase: !!SUPABASE_SERVICE }
    });
  }

  // ── SEARCH YOUTUBE ────────────────────────────────
  if (req.method === 'POST' && action === 'search-youtube') {
    if (!YOUTUBE_API_KEY) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });
    const { query, max = 20, content_type = 'film' } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    const duration = content_type === 'film' ? '&videoDuration=long' : '';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${max}${duration}&key=${YOUTUBE_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'YouTube error', details: data });

    // Get video details (duration, embeddable)
    const ids = (data.items||[]).map(i=>i.id.videoId).join(',');
    let details = {};
    if (ids) {
      const dr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ids}&key=${YOUTUBE_API_KEY}`);
      const dd = await dr.json();
      (dd.items||[]).forEach(v => {
        const iso = v.contentDetails?.duration || '';
        const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const sec = m ? (+m[1]||0)*3600 + (+m[2]||0)*60 + (+m[3]||0) : 0;
        details[v.id] = { duration_sec: sec, embeddable: v.status?.embeddable !== false };
      });
    }

    const results = (data.items||[]).map(item => {
      const ytId = item.id.videoId;
      const title = item.snippet.title;
      const d = details[ytId] || {};
      return {
        ytId, title,
        title_ar: title,
        poster_url: item.snippet.thumbnails?.medium?.url,
        description: item.snippet.description?.slice(0,500),
        origin: detectOrigin(title),
        language: detectLanguage(title),
        category: detectCategory(title),
        duration_sec: d.duration_sec || null,
        embeddable: d.embeddable !== false,
        year: new Date(item.snippet.publishedAt).getFullYear()
      };
    });

    return res.json({ ok: true, results, total: results.length });
  }

  // ── IMPORT FILM ───────────────────────────────────
  if (req.method === 'POST' && action === 'import-film') {
    const { ytId, title_ar, origin, language, category, year, duration_sec, description, poster_url, embeddable } = req.body;
    if (!ytId || !title_ar) return res.status(400).json({ error: 'ytId and title_ar required' });
    const id = `film_${ytId}`;
    const r = await sb('POST', 'content', {
      id, type: 'film', title_ar,
      origin:       origin    || detectOrigin(title_ar),
      language:     language  || detectLanguage(title_ar),
      category:     category  || detectCategory(title_ar),
      yt_id:        ytId,
      poster_url:   poster_url || `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
      year:         year || null,
      duration_sec: duration_sec || null,
      description:  description || null,
      embeddable:   embeddable !== false
    }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── IMPORT EPISODE ────────────────────────────────
  if (req.method === 'POST' && action === 'import-episode') {
    const { ytId, series_id, title_ar, season = 1, episode, duration_sec, embeddable, source } = req.body;
    if (!ytId || !series_id) return res.status(400).json({ error: 'ytId and series_id required' });
    const id = `ep_${ytId}`;
    const r = await sb('POST', 'episodes', {
      id, content_id: series_id, yt_id: ytId,
      title_ar: title_ar || null,
      season: season || 1,
      episode: episode || null,
      duration_sec: duration_sec || null,
      embeddable: embeddable !== false,
      source: source || null
    }, SUPABASE_SERVICE);
    // Update series avail_eps count
    if (r.ok) {
      await sb('POST', `rpc/increment_avail_eps`, { series_id_arg: series_id }, SUPABASE_SERVICE).catch(()=>{});
    }
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── IMPORT BATCH (full auto) ──────────────────────
  if (req.method === 'POST' && action === 'import-batch') {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items array required' });

    let imported = 0, skipped = 0, errors = 0;
    for (const item of items) {
      try {
        const id = `film_${item.ytId}`;
        const r = await sb('POST', 'content', {
          id, type: 'film',
          title_ar:   item.title_ar || item.title || item.ytId,
          origin:     item.origin    || detectOrigin(item.title_ar || ''),
          language:   item.language  || detectLanguage(item.title_ar || ''),
          category:   item.category  || detectCategory(item.title_ar || ''),
          yt_id:      item.ytId,
          poster_url: item.poster_url || `https://img.youtube.com/vi/${item.ytId}/mqdefault.jpg`,
          year:         item.year         || null,
          duration_sec: item.duration_sec || null,
          description:  item.description  || null,
          embeddable:   item.embeddable   !== false
        }, SUPABASE_SERVICE);
        r.status === 409 ? skipped++ : r.ok ? imported++ : errors++;
      } catch { errors++; }
    }

    // Log to discovery_log
    await sb('POST', 'discovery_log', {
      query: items[0]?.query || 'batch',
      found: items.length, imported, skipped
    }, SUPABASE_SERVICE).catch(()=>{});

    return res.json({ ok: true, imported, skipped, errors, total: items.length });
  }

  // ── IMPORT SERIES (create/update metadata) ────────
  if (req.method === 'POST' && action === 'import-series') {
    let { id, title_ar, title_orig, origin, language, category, total_eps, poster_url, description, year } = req.body;
    if (!id || !title_ar) return res.status(400).json({ error: 'id and title_ar required' });
    // Ensure ID is ASCII-safe (remove non-ASCII characters)
    id = id.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'series_' + Date.now();
    if (!id.startsWith('series_')) id = 'series_' + id;
    const r = await sb('POST', 'content', {
      id, type: 'series', title_ar, title_orig: title_orig || null,
      origin: origin || 'other', language: language || 'ar_dubbed',
      category: category || 'drama',
      total_eps: total_eps || 0, avail_eps: 0,
      poster_url: poster_url || null,
      description: description || null,
      year: year || null
    }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, id, status: r.status });
  }

  // ── VERIFY ────────────────────────────────────────
  if (req.method === 'POST' && action === 'verify') {
    const { ytIds } = req.body;
    if (!ytIds?.length) return res.status(400).json({ error: 'ytIds required' });
    const results = await Promise.allSettled(
      ytIds.map(async ytId => {
        const r = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${ytId}&format=json`);
        return { ytId, alive: r.ok };
      })
    );
    const dead = results.filter(r=>r.status==='fulfilled'&&!r.value.alive).map(r=>r.value.ytId);
    const alive = ytIds.length - dead.length;
    return res.json({ ok: true, checked: ytIds.length, alive, dead, dead_count: dead.length });
  }

  return res.status(404).json({ error: `Unknown action: ${action}` });
}
