const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

const ALLOWED_ORIGINS = new Set([
  'https://mawso3a-stream.vercel.app',
  'https://mawso3a-stream-chi.vercel.app'
]);

async function sb(method, path, body, key) {
  const res = await fetch(`${SB_URL}/${path}`, {
    method,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal,resolution=ignore-duplicates' : 'return=minimal'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const N8N_SECRET = process.env.N8N_SECRET;
  const SVC = process.env.SUPABASE_SERVICE_KEY;
  if (!N8N_SECRET || !SVC) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const action = req.query.action || '';

  // Batch submit candidates from n8n discovery workflows
  if (action === 'submit') {
    const { candidates = [] } = req.body || {};
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'candidates array required' });
    }

    const rows = candidates
      .filter(c => c.platform_id)
      .map(c => {
        const platform = c.platform || 'youtube';
        return {
          id: `${platform}_${c.platform_id}`,
          platform,
          platform_id: String(c.platform_id),
          title_raw: String(c.title_raw || c.title_ar || '').slice(0, 300),
          title_ar: (c.title_ar || '').slice(0, 200) || null,
          type: ['film','series','episode'].includes(c.type) ? c.type : 'film',
          origin: c.origin || 'other',
          language: c.language || 'ar_dubbed',
          category: c.category || 'drama',
          year: c.year ? parseInt(c.year) : null,
          duration_sec: c.duration_sec ? parseInt(c.duration_sec) : null,
          poster_url: (c.poster_url || '').slice(0, 500) || null,
          embed_url: (c.embed_url || '').slice(0, 500) || null,
          embeddable: c.embeddable !== false,
          series_title: c.series_title || null,
          season: c.season ? parseInt(c.season) : null,
          episode_num: c.episode_num ? parseInt(c.episode_num) : null,
          keyword: (c.keyword || '').slice(0, 200) || null,
          source_workflow: (c.source_workflow || '').slice(0, 100) || null,
          status: 'pending'
        };
      });

    if (rows.length === 0) return res.json({ ok: true, submitted: 0, inserted: 0, skipped: 0 });

    // Batch insert (ignore duplicates via UNIQUE constraint)
    let inserted = 0, skipped = 0, errors = 0;
    // Insert in chunks of 20 to avoid Supabase payload limits
    for (let i = 0; i < rows.length; i += 20) {
      const chunk = rows.slice(i, i + 20);
      const r = await sb('POST', 'discovery_candidates', chunk, SVC);
      if (r.ok) {
        inserted += chunk.length;
      } else if (r.status === 409) {
        skipped += chunk.length;
      } else {
        // Fallback: insert one by one to isolate dups
        for (const row of chunk) {
          const sr = await sb('POST', 'discovery_candidates', row, SVC);
          if (sr.ok) inserted++;
          else if (sr.status === 409) skipped++;
          else errors++;
        }
      }
    }

    return res.json({ ok: true, submitted: rows.length, inserted, skipped, errors });
  }

  // Log discovery run stats
  if (action === 'log') {
    const { query, found, imported, skipped } = req.body || {};
    await sb('POST', 'discovery_log', {
      query: (query || 'n8n').slice(0, 300),
      found: found || 0,
      imported: imported || 0,
      skipped: skipped || 0
    }, SVC);
    return res.json({ ok: true });
  }

  // Update keyword stats after a run
  if (action === 'update-keyword') {
    const { keyword, found, imported } = req.body || {};
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    const successRate = found > 0 ? Math.round((imported / found) * 100 * 100) / 100 : 0;
    await sb('PATCH', `keyword_queue?keyword=eq.${encodeURIComponent(keyword)}`, {
      last_run_at: new Date().toISOString(),
      run_count: null, // incremented via SQL below — just timestamp for now
      total_found: null,
      total_imported: null,
      success_rate: successRate
    }, SVC);
    // Log performance
    await sb('POST', 'keyword_performance', {
      keyword: keyword.slice(0, 200),
      platform: (req.body.platform || 'youtube').slice(0, 50),
      found: found || 0,
      imported: imported || 0,
      rejected: (found || 0) - (imported || 0)
    }, SVC);
    return res.json({ ok: true });
  }

  return res.status(404).json({ error: `Unknown action: ${action}` });
}
