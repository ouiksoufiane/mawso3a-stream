// Dynamic XML sitemap for SEO
const SB_URL  = 'https://wadazxpofizrfoczhmkn.supabase.co/rest/v1';
const BASE_URL = 'https://mawso3a-stream.vercel.app';

function xmlEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq = 'weekly', priority = '0.6') {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).end();

  const today = new Date().toISOString().slice(0, 10);

  // Fetch active content IDs and updated_at
  const r = await fetch(
    `${SB_URL}/content?status=eq.active&select=id,type,updated_at&order=updated_at.desc&limit=1000`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
  );
  const items = await r.json().catch(() => []);

  const staticPages = [
    urlEntry(`${BASE_URL}/`,           today, 'daily',   '1.0'),
    urlEntry(`${BASE_URL}/films.html`, today, 'daily',   '0.9'),
    urlEntry(`${BASE_URL}/series.html`,today, 'daily',   '0.9'),
    urlEntry(`${BASE_URL}/search.html`,today, 'weekly',  '0.7'),
    urlEntry(`${BASE_URL}/legal.html`, today, 'monthly', '0.3')
  ];

  const contentPages = items.map(item => {
    const lastmod = (item.updated_at || today).slice(0, 10);
    if (item.type === 'series') {
      return urlEntry(`${BASE_URL}/series-detail.html?id=${encodeURIComponent(item.id)}`, lastmod, 'daily', '0.8');
    }
    return urlEntry(`${BASE_URL}/watch.html?id=${encodeURIComponent(item.id)}`, lastmod, 'weekly', '0.7');
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticPages, ...contentPages].join('\n')}\n</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
