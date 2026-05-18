const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

async function count(table, filter, key) {
  const res = await fetch(`${SB_URL}/${table}?${filter}`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'count=exact',
      'Range': '0-0'
    }
  });
  const cr = res.headers.get('content-range');
  return parseInt(cr?.split('/')[1] || '0');
}

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET       = process.env.N8N_SECRET;
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!N8N_SECRET) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });

  const [films, series, eps, pending, deadLinks, logs] = await Promise.all([
    count('content', 'type=eq.film&status=eq.active', SUPABASE_SERVICE),
    count('content', 'type=eq.series&status=eq.active', SUPABASE_SERVICE),
    count('episodes', '', SUPABASE_SERVICE),
    count('content', 'status=eq.pending', SUPABASE_SERVICE),
    count('dead_links', 'reports=gte.3', SUPABASE_SERVICE),
    count('discovery_log', '', SUPABASE_SERVICE)
  ]);

  const logRes = await fetch(`${SB_URL}/discovery_log?order=run_at.desc&limit=3`, {
    headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
  });
  const recentLogs = await logRes.json().catch(() => []);

  return res.json({
    status: 'ok',
    stats: { films, series, episodes: eps, pending, dead_links: deadLinks, discovery_runs: logs },
    recent_discovery: recentLogs.map(l => ({ at: l.run_at, imported: l.imported, query: l.query }))
  });
}
