const SB_URL  = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';
const SB_ANON = 'sb_publishable_50j1Q_SJc1HA4fWXjO9jsA_wzsub0Az';

const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': `Bearer ${SB_ANON}`,
  'Accept': 'application/json'
};

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/${path}`, { headers: HEADERS });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`DB ${res.status}: ${err}`);
  }
  return res.json();
}

async function sbCount(path) {
  const res = await fetch(`${SB_URL}/${path}`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' }
  });
  const cr = res.headers.get('content-range');
  return parseInt(cr?.split('/')[1] || '0');
}

async function sbRpc(fn, args = {}) {
  const res = await fetch(`${SB_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  return res.json().catch(() => null);
}

// ── Stats ──────────────────────────────────────────────────────
export async function getStats() {
  const [films, series, eps] = await Promise.all([
    sbCount('content?type=eq.film&status=eq.active'),
    sbCount('content?type=eq.series&status=eq.active'),
    sbCount('episodes')
  ]);
  return { films, series, eps };
}

// ── Content list with full filter support ────────────────────
export async function getContent({
  type, origin, language, category,
  limit = 24, offset = 0,
  order = 'created_at.desc',
  year, status = 'active'
} = {}) {
  let q = `content?order=${order}&limit=${limit}&offset=${offset}&select=*`;
  if (status)   q += `&status=eq.${status}`;
  if (type)     q += `&type=eq.${type}`;
  if (origin)   q += `&origin=eq.${origin}`;
  if (language) q += `&language=eq.${language}`;
  if (category) q += `&category=eq.${category}`;
  if (year)     q += `&year=eq.${year}`;
  return sbGet(q);
}

export async function countContent({ type, origin, language, category, year, status = 'active' } = {}) {
  let q = `content?status=eq.${status}`;
  if (type)     q += `&type=eq.${type}`;
  if (origin)   q += `&origin=eq.${origin}`;
  if (language) q += `&language=eq.${language}`;
  if (category) q += `&category=eq.${category}`;
  if (year)     q += `&year=eq.${year}`;
  return sbCount(q);
}

export async function getContentById(id) {
  const arr = await sbGet(`content?id=eq.${encodeURIComponent(id)}&select=*`);
  return arr[0] || null;
}

// ── Search: title_ar + title_orig with optional filters ──────
export async function searchContent(q, { type, origin, language, category, year, limit = 40 } = {}) {
  let path;
  if (q && q.trim().length >= 2) {
    const enc = encodeURIComponent(q.trim());
    path = `content?status=eq.active&or=(title_ar.ilike.*${enc}*,title_orig.ilike.*${enc}*)&order=view_count.desc&limit=${limit}&select=*`;
  } else {
    path = `content?status=eq.active&order=view_count.desc,created_at.desc&limit=${limit}&select=*`;
  }
  if (type)     path += `&type=eq.${type}`;
  if (origin)   path += `&origin=eq.${origin}`;
  if (language) path += `&language=eq.${language}`;
  if (category) path += `&category=eq.${category}`;
  if (year)     path += `&year=eq.${year}`;
  return sbGet(path);
}

// ── Episodes ─────────────────────────────────────────────────
export async function getEpisodes(contentId, season) {
  let q = `episodes?content_id=eq.${encodeURIComponent(contentId)}&order=season.asc,episode.asc&select=*`;
  if (season !== undefined && season !== null) q += `&season=eq.${season}`;
  return sbGet(q);
}

export async function getSeasons(contentId) {
  const eps = await sbGet(`episodes?content_id=eq.${encodeURIComponent(contentId)}&select=season&order=season.asc`);
  return [...new Set(eps.map(e => e.season).filter(Boolean))].sort((a,b)=>a-b);
}

export async function getRecentEpisodes(limit = 16) {
  return sbGet(`episodes?order=created_at.desc&limit=${limit}&select=*,content:content_id(id,title_ar,poster_url,origin)`);
}

// ── Featured / By origin ──────────────────────────────────────
export async function getFeatured({ limit = 10 } = {}) {
  return sbGet(`content?status=eq.active&poster_url=not.is.null&order=view_count.desc,created_at.desc&limit=${limit}&select=*`);
}

export async function getByOrigin(origin, type, limit = 12) {
  return sbGet(`content?status=eq.active&origin=eq.${origin}&type=eq.${type}&order=created_at.desc&limit=${limit}&select=*`);
}

// ── View count: use RPC to safely increment ──────────────────
export async function incrementView(id) {
  try {
    await sbRpc('increment_view', { content_id: id });
  } catch {}
}

// ── Content sources (multi-platform) ─────────────────────────
export async function getContentSources(contentId, episodeId = null) {
  let q = `content_sources?content_id=eq.${encodeURIComponent(contentId)}&is_working=eq.true&active=eq.true&embeddable=eq.true&order=is_primary.desc,added_at.asc&select=*`;
  if (episodeId) q += `&episode_id=eq.${encodeURIComponent(episodeId)}`;
  else q += '&episode_id=is.null';
  try { return await sbGet(q); } catch { return []; }
}

// ── Report dead link ─────────────────────────────────────────
export async function reportDeadLink(contentId, ytId, sourceId = null) {
  try {
    await fetch('/api/report-dead-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId, ytId, sourceId })
    });
  } catch {}
}

// ── Request content ──────────────────────────────────────────
export async function requestContent(data) {
  const res = await fetch('/api/request-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
