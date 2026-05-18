const SB_URL = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mawso3a-stream.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE) return res.status(500).json({ error: 'Config error' });

  const { title, type = 'film', origin, language, notes } = req.body || {};
  if (!title || title.trim().length < 2) return res.status(400).json({ error: 'Title required (min 2 chars)' });
  if (title.length > 200) return res.status(400).json({ error: 'Title too long' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '';

  const r = await fetch(`${SB_URL}/content_requests`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      title: title.trim().slice(0, 200),
      type: ['film','series'].includes(type) ? type : 'film',
      origin: origin?.slice(0,50) || null,
      language: language?.slice(0,20) || null,
      notes: notes?.slice(0, 500) || null,
      ip: ip.slice(0, 45)
    })
  });

  if (!r.ok) return res.status(500).json({ error: 'Failed to save request' });
  return res.json({ ok: true, message: 'تم استلام طلبك بنجاح. سنحاول إضافة المحتوى قريباً.' });
}
