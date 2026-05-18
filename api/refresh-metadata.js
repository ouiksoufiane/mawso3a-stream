// Refresh YouTube metadata and optionally TMDB for a content item
const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

async function sb(method, path, body, key) {
  const res = await fetch(`${SB_URL}/${path}`, {
    method,
    headers: {
      'apikey': key, 'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}

async function fetchYouTubeDetails(ytId, apiKey) {
  if (!apiKey || !ytId) return null;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${ytId}&key=${apiKey}`;
  const r = await fetch(url);
  const d = await r.json();
  const item = d.items?.[0];
  if (!item) return null;

  const iso = item.contentDetails?.duration || '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const duration_sec = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null;

  return {
    title:        item.snippet.title,
    description:  (item.snippet.description || '').slice(0, 1000),
    poster_url:   item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
    duration_sec,
    embeddable:   item.status?.embeddable !== false,
    year:         new Date(item.snippet.publishedAt).getFullYear()
  };
}

async function fetchTmdbDetails(title, type, apiKey) {
  if (!apiKey || !title) return null;
  const endpoint = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(title)}&language=ar&api_key=${apiKey}`;
  const r = await fetch(url);
  const d = await r.json().catch(() => null);
  const item = d?.results?.[0];
  if (!item) return null;

  const posterPath = item.poster_path;
  return {
    title_orig:   item.original_title || item.original_name || null,
    description:  (item.overview || '').slice(0, 1000) || null,
    poster_url:   posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
    year:         parseInt((item.release_date || item.first_air_date || '').slice(0, 4)) || null
  };
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const N8N_SECRET       = process.env.N8N_SECRET;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  const YOUTUBE_API_KEY  = process.env.YOUTUBE_API_KEY;
  const TMDB_API_KEY     = process.env.TMDB_API_KEY;

  if (!N8N_SECRET) return res.status(500).json({ error: 'Config error' });
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });

  const { content_id, sources = ['youtube', 'tmdb'] } = req.body || {};
  if (!content_id) return res.status(400).json({ error: 'content_id required' });

  // Fetch existing content
  const existing = await sb('GET', `content?id=eq.${encodeURIComponent(content_id)}&select=*`, null, SUPABASE_SERVICE);
  const item = existing.data?.[0];
  if (!item) return res.status(404).json({ error: 'Content not found' });

  const updates = {};
  const refreshed = [];

  // Refresh from YouTube
  if (sources.includes('youtube') && item.yt_id && YOUTUBE_API_KEY) {
    const yt = await fetchYouTubeDetails(item.yt_id, YOUTUBE_API_KEY);
    if (yt) {
      if (yt.duration_sec)  updates.duration_sec = yt.duration_sec;
      if (yt.embeddable !== undefined) updates.embeddable = yt.embeddable;
      if (yt.poster_url && !item.poster_url) updates.poster_url = yt.poster_url;
      if (yt.year && !item.year) updates.year = yt.year;
      refreshed.push('youtube');
    }
  }

  // Refresh from TMDB (poster + metadata, don't overwrite existing good data)
  if (sources.includes('tmdb') && TMDB_API_KEY) {
    const tmdb = await fetchTmdbDetails(item.title_ar, item.type, TMDB_API_KEY);
    if (tmdb) {
      if (tmdb.poster_url && !item.poster_url) updates.poster_url = tmdb.poster_url;
      if (tmdb.title_orig && !item.title_orig) updates.title_orig = tmdb.title_orig;
      if (tmdb.description && !item.description) updates.description = tmdb.description;
      if (tmdb.year && !item.year) updates.year = tmdb.year;
      refreshed.push('tmdb');
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ ok: true, content_id, updated: false, refreshed, message: 'Nothing to update' });
  }

  const r = await sb('PATCH', `content?id=eq.${encodeURIComponent(content_id)}`, updates, SUPABASE_SERVICE);
  return res.json({ ok: r.ok, content_id, updated: true, fields: Object.keys(updates), refreshed });
}
