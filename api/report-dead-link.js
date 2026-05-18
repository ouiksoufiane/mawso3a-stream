const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mawso3a-stream.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'Config error' });

  const { contentId, ytId } = req.body || {};
  if (!contentId && !ytId) return res.status(400).json({ error: 'contentId or ytId required' });

  const headers = {
    'apikey': SUPABASE_SERVICE,
    'Authorization': `Bearer ${SUPABASE_SERVICE}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal,resolution=merge-duplicates'
  };

  // Upsert into dead_links
  await fetch(`${SB_URL}/dead_links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content_id: contentId || null,
      yt_id: ytId || null,
      reports: 1
    })
  });

  // If 3+ reports, mark content hidden
  const countRes = await fetch(`${SB_URL}/dead_links?content_id=eq.${encodeURIComponent(contentId||'')}&select=reports`, {
    headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
  });
  const rows = await countRes.json().catch(() => []);
  const totalReports = rows.reduce((s, r) => s + (r.reports||1), 0);

  if (totalReports >= 3 && contentId) {
    await fetch(`${SB_URL}/content?id=eq.${encodeURIComponent(contentId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'hidden' })
    });
  }

  return res.json({ ok: true, totalReports });
}
