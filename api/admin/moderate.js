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
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET       = process.env.N8N_SECRET;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!N8N_SECRET || !SUPABASE_SERVICE) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action || (req.body && req.body.action);

  // ── LIST all content (admin view, any status) ────
  if (req.method === 'GET' && action === 'list-content') {
    const { type, origin, status, search, limit = 20, offset = 0 } = req.query;
    let path = `content?order=created_at.desc&limit=${Math.min(+limit||20,100)}&offset=${+offset||0}&select=id,type,title_ar,origin,language,status,view_count,poster_url,yt_id,created_at,avail_eps`;
    if (status) path += `&status=eq.${encodeURIComponent(status)}`;
    if (type)   path += `&type=eq.${encodeURIComponent(type)}`;
    if (origin) path += `&origin=eq.${encodeURIComponent(origin)}`;
    if (search) path += `&title_ar=ilike.*${encodeURIComponent(search)}*`;
    const r = await sb('GET', path, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  // ── LIST discovery logs ───────────────────────────
  if (req.method === 'GET' && action === 'list-logs') {
    const { limit = 50 } = req.query;
    const r = await sb('GET', `discovery_log?order=run_at.desc&limit=${Math.min(+limit||50,200)}`, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  // ── LIST pending content ──────────────────────────
  if (req.method === 'GET' && action === 'list-pending') {
    const { type, limit = 50 } = req.query;
    let path = `content?status=eq.pending&order=created_at.desc&limit=${limit}&select=id,type,title_ar,origin,language,yt_id,poster_url,created_at`;
    if (type) path += `&type=eq.${type}`;
    const r = await sb('GET', path, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [], count: (r.data || []).length });
  }

  // ── LIST dead links ───────────────────────────────
  if (req.method === 'GET' && action === 'list-dead') {
    const r = await sb('GET', 'dead_links?order=reports.desc&limit=100&select=id,content_id,yt_id,reports,last_report', null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  // ── LIST content requests ─────────────────────────
  if (req.method === 'GET' && action === 'list-requests') {
    const { status = 'pending' } = req.query;
    const r = await sb('GET', `content_requests?status=eq.${status}&order=created_at.desc&limit=100`, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, status, title_ar, description, poster_url, origin, language, category, year } = req.body || {};

  // ── APPROVE / ACTIVATE ────────────────────────────
  if (action === 'approve') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb('PATCH', `content?id=eq.${encodeURIComponent(id)}`, { status: 'active' }, SUPABASE_SERVICE);
    await logAction('approve', id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── REJECT / HIDE ─────────────────────────────────
  if (action === 'reject' || action === 'hide') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb('PATCH', `content?id=eq.${encodeURIComponent(id)}`, { status: 'hidden' }, SUPABASE_SERVICE);
    await logAction(action, id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── SET PENDING ───────────────────────────────────
  if (action === 'pending') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb('PATCH', `content?id=eq.${encodeURIComponent(id)}`, { status: 'pending' }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── UPDATE METADATA ───────────────────────────────
  if (action === 'update') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch = {};
    if (title_ar)     patch.title_ar     = title_ar.slice(0, 200);
    if (description)  patch.description  = description.slice(0, 1000);
    if (poster_url)   patch.poster_url   = poster_url.slice(0, 500);
    if (origin)       patch.origin       = origin;
    if (language)     patch.language     = language;
    if (category)     patch.category     = category;
    if (year)         patch.year         = parseInt(year) || null;
    if (status && ['active','hidden','pending','incomplete'].includes(status)) patch.status = status;

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });
    const r = await sb('PATCH', `content?id=eq.${encodeURIComponent(id)}`, patch, SUPABASE_SERVICE);
    await logAction('update', id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, updated: patch });
  }

  // ── DELETE content ────────────────────────────────
  if (action === 'delete') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb('DELETE', `content?id=eq.${encodeURIComponent(id)}`, null, SUPABASE_SERVICE);
    await logAction('delete', id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── CLOSE dead link report ────────────────────────
  if (action === 'close-dead-link') {
    if (!id) return res.status(400).json({ error: 'id (dead_links row id) required' });
    const r = await sb('DELETE', `dead_links?id=eq.${encodeURIComponent(id)}`, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── RESOLVE content request ───────────────────────
  if (action === 'resolve-request') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const newStatus = req.body.done ? 'done' : 'rejected';
    const r = await sb('PATCH', `content_requests?id=eq.${encodeURIComponent(id)}`, { status: newStatus }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── BULK APPROVE by origin ────────────────────────
  if (action === 'bulk-approve-origin') {
    const { origin: orig } = req.body || {};
    if (!orig) return res.status(400).json({ error: 'origin required' });
    const r = await sb('PATCH', `content?origin=eq.${encodeURIComponent(orig)}&status=eq.pending`,
      { status: 'active' }, SUPABASE_SERVICE);
    await logAction('bulk-approve', orig, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  return res.status(404).json({ error: `Unknown action: ${action}` });
}

async function logAction(action, targetId, serviceKey) {
  await fetch(`${SB_URL}/admin_actions`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ action, target_id: String(targetId).slice(0, 200) })
  }).catch(() => {});
}
