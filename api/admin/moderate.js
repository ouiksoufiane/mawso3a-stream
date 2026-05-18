const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

async function sbHead(path, serviceKey) {
  const res = await fetch(`${SB_URL}/${path}`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'count=exact',
      'Range': '0-0'
    }
  });
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0') || 0;
}

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
  const reqOrigin = req.headers['origin'] || '';
  if (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET       = process.env.N8N_SECRET;
  const ADMIN_TOKEN      = process.env.ADMIN_TOKEN;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  const validTokens = [N8N_SECRET, ADMIN_TOKEN].filter(Boolean);
  if (!validTokens.length || !validTokens.some(t => auth === `Bearer ${t}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action || (req.body && req.body.action);

  // ── STATS ─────────────────────────────────────────
  if (req.method === 'GET' && action === 'list-stats') {
    const origins = ['turkish','indian','chinese','moroccan','american','korean','other'];
    const [films, series, eps, total, ...originCounts] = await Promise.all([
      sbHead('content?type=eq.film&status=eq.active', SUPABASE_SERVICE),
      sbHead('content?type=eq.series&status=eq.active', SUPABASE_SERVICE),
      sbHead('episodes', SUPABASE_SERVICE),
      sbHead('content?status=eq.active', SUPABASE_SERVICE),
      ...origins.map(o => sbHead(`content?status=eq.active&origin=eq.${o}`, SUPABASE_SERVICE))
    ]);
    const distribution = Object.fromEntries(origins.map((o, i) => [o, originCounts[i]]));
    return res.json({ ok: true, films, series, episodes: eps, total, distribution });
  }

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

  // ── LIST discovery candidates ─────────────────────────────────────────
  if (req.method === 'GET' && action === 'list-candidates') {
    const { status: cs, platform, limit = 50, offset = 0 } = req.query;
    let path = `discovery_candidates?order=created_at.desc&limit=${Math.min(+limit||50,200)}&offset=${+offset||0}`;
    if (cs) path += `&status=eq.${encodeURIComponent(cs)}`;
    if (platform) path += `&platform=eq.${encodeURIComponent(platform)}`;
    const r = await sb('GET', path, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  // ── LIST keyword queue ─────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'list-keywords') {
    const { active } = req.query;
    let path = 'keyword_queue?order=priority.desc,keyword.asc&limit=200';
    if (active === 'true') path += '&active=eq.true';
    const r = await sb('GET', path, null, SUPABASE_SERVICE);
    return res.json({ ok: r.ok, items: r.data || [] });
  }

  // ── LIST provider health ───────────────────────────────────────────────
  if (req.method === 'GET' && action === 'list-providers') {
    const r = await sb('GET', 'provider_health?order=id.asc', null, SUPABASE_SERVICE);
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

  // ── APPROVE CANDIDATE → promote to content ─────────────────────────────
  if (action === 'approve-candidate') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(id)}`,
      { status: 'approved', reviewed_at: new Date().toISOString() }, SUPABASE_SERVICE);
    await logAction('approve-candidate', id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── REJECT CANDIDATE ───────────────────────────────────────────────────
  if (action === 'reject-candidate') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const reason = (req.body.reason || 'manual_reject').slice(0, 100);
    const r = await sb('PATCH', `discovery_candidates?id=eq.${encodeURIComponent(id)}`,
      { status: 'rejected', reject_reason: reason, reviewed_at: new Date().toISOString() }, SUPABASE_SERVICE);
    await logAction('reject-candidate', id, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── UPDATE PROVIDER HEALTH ─────────────────────────────────────────────
  if (action === 'update-provider') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch = { updated_at: new Date().toISOString() };
    if (req.body.enabled !== undefined)   patch.enabled = Boolean(req.body.enabled);
    if (req.body.quota_status)            patch.quota_status = req.body.quota_status;
    if (req.body.notes !== undefined)     patch.notes = String(req.body.notes).slice(0, 500);
    if (req.body.used_today !== undefined) patch.used_today = parseInt(req.body.used_today) || 0;
    const r = await sb('PATCH', `provider_health?id=eq.${encodeURIComponent(id)}`, patch, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── UPDATE KEYWORD ─────────────────────────────────────────────────────
  if (action === 'update-keyword') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch = {};
    if (req.body.priority !== undefined) patch.priority = Math.min(10, Math.max(1, parseInt(req.body.priority)));
    if (req.body.active !== undefined)   patch.active = Boolean(req.body.active);
    if (req.body.category)               patch.category = req.body.category;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields' });
    const r = await sb('PATCH', `keyword_queue?id=eq.${encodeURIComponent(id)}`, patch, SUPABASE_SERVICE);
    return res.json({ ok: r.ok });
  }

  // ── ADD KEYWORD ────────────────────────────────────────────────────────
  if (action === 'add-keyword') {
    const { keyword: kw, lang, category: cat, priority: pri } = req.body || {};
    if (!kw) return res.status(400).json({ error: 'keyword required' });
    const r = await sb('POST', 'keyword_queue', {
      keyword: kw.slice(0, 300),
      lang: lang || 'ar',
      category: cat || 'drama',
      priority: Math.min(10, Math.max(1, parseInt(pri) || 5))
    }, SUPABASE_SERVICE);
    return res.json({ ok: r.ok || r.status === 409 });
  }

  // ── BULK PURGE old rejected candidates ────────────────────────────────
  if (action === 'purge-rejected') {
    const days = parseInt(req.body.days) || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const r = await sb('DELETE',
      `discovery_candidates?status=in.(rejected,duplicate)&created_at=lt.${cutoff}`,
      null, SUPABASE_SERVICE);
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
