const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mawso3a-stream.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'Config error' });

  const { contentId, ytId, sourceId } = req.body || {};
  if (!contentId && !ytId) return res.status(400).json({ error: 'contentId or ytId required' });

  const rpcRes = await fetch(`${SB_URL}/rpc/report_dead_link`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_content_id: contentId || null,
      p_yt_id: ytId || null,
      p_source_id: sourceId ? parseInt(sourceId) : null
    })
  });

  if (!rpcRes.ok) {
    const err = await rpcRes.text().catch(() => '');
    return res.status(500).json({ error: 'RPC failed', detail: err });
  }

  const reports = await rpcRes.json().catch(() => null);
  return res.json({ ok: true, reports });
}
