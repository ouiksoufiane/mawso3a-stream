const SB_URL  = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';
const SB_ANON = 'sb_publishable_50j1Q_SJc1HA4fWXjO9jsA_wzsub0Az';

const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': `Bearer ${SB_ANON}`,
  'Accept': 'application/json'
};

async function sbGet(path, opts = {}) {
  const url = new URL(`${SB_URL}/${path}`);
  const res = await fetch(url, { headers: { ...HEADERS, ...opts } });
  if (!res.ok) throw new Error(`DB ${res.status}`);
  return res.json();
}

async function sbCount(path) {
  const res = await fetch(`${SB_URL}/${path}`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' }
  });
  const cr = res.headers.get('content-range');
  return parseInt(cr?.split('/')[1] || '0');
}

// ── Content queries ──────────────────────────────────────────

export async function getStats() {
  const [films, series, eps] = await Promise.all([
    sbCount('content?type=eq.film&status=eq.active'),
    sbCount('content?type=eq.series&status=eq.active'),
    sbCount('episodes')
  ]);
  return { films, series, eps };
}

export async function getContent({ type, origin, language, category, limit = 24, offset = 0, order = 'created_at.desc' } = {}) {
  let q = `content?status=eq.active&order=${order}&limit=${limit}&offset=${offset}&select=*`;
  if (type)     q += `&type=eq.${type}`;
  if (origin)   q += `&origin=eq.${origin}`;
  if (language) q += `&language=eq.${language}`;
  if (category) q += `&category=eq.${category}`;
  return sbGet(q);
}

export async function countContent({ type, origin, language, category } = {}) {
  let q = `content?status=eq.active`;
  if (type)     q += `&type=eq.${type}`;
  if (origin)   q += `&origin=eq.${origin}`;
  if (language) q += `&language=eq.${language}`;
  if (category) q += `&category=eq.${category}`;
  return sbCount(q);
}

export async function getContentById(id) {
  const arr = await sbGet(`content?id=eq.${encodeURIComponent(id)}&select=*`);
  return arr[0] || null;
}

export async function searchContent(q, { type } = {}) {
  let path = `content?status=eq.active&title_ar=ilike.*${encodeURIComponent(q)}*&order=view_count.desc&limit=40&select=*`;
  if (type) path += `&type=eq.${type}`;
  return sbGet(path);
}

export async function getEpisodes(contentId, season) {
  let q = `episodes?content_id=eq.${encodeURIComponent(contentId)}&order=episode.asc&select=*`;
  if (season !== undefined && season !== null) q += `&season=eq.${season}`;
  return sbGet(q);
}

export async function getSeasons(contentId) {
  const eps = await sbGet(`episodes?content_id=eq.${encodeURIComponent(contentId)}&select=season&order=season.asc`);
  return [...new Set(eps.map(e => e.season).filter(Boolean))].sort((a,b)=>a-b);
}

export async function getFeatured({ limit = 10 } = {}) {
  return sbGet(`content?status=eq.active&order=view_count.desc,created_at.desc&limit=${limit}&select=*`);
}

export async function getByOrigin(origin, type, limit = 12) {
  return sbGet(`content?status=eq.active&origin=eq.${origin}&type=eq.${type}&order=created_at.desc&limit=${limit}&select=*`);
}

export async function incrementView(id) {
  await fetch(`${SB_URL}/content?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ view_count: null })
  }).catch(() => {});
}
