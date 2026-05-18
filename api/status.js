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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE) return res.json({ status: 'error', reason: 'SUPABASE_SERVICE_KEY missing' });

  const [films, series, eps, logs] = await Promise.all([
    count('content', 'type=eq.film&status=eq.active', SUPABASE_SERVICE),
    count('content', 'type=eq.series&status=eq.active', SUPABASE_SERVICE),
    count('episodes', '', SUPABASE_SERVICE),
    count('discovery_log', '', SUPABASE_SERVICE)
  ]);

  // Last discovery run
  const logRes = await fetch(`${SB_URL}/discovery_log?order=run_at.desc&limit=1`, {
    headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
  });
  const logData = await logRes.json();
  const lastRun = logData[0] || null;

  return res.json({
    status: 'ok',
    stats: { films, series, episodes: eps, discovery_runs: logs },
    last_discovery: lastRun ? { at: lastRun.run_at, imported: lastRun.imported, query: lastRun.query } : null,
    env: {
      youtube:  !!process.env.YOUTUBE_API_KEY,
      supabase: !!SUPABASE_SERVICE,
      n8n:      !!process.env.N8N_SECRET
    }
  });
}
