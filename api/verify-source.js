// POST /api/verify-source
// Body: { platform, platform_id }
// Returns: { ok, embeddable, reason }
// Auth: Bearer N8N_SECRET

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const N8N_SECRET = process.env.N8N_SECRET;
  if (!N8N_SECRET) return res.status(500).json({ error: 'Config error' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${N8N_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const { platform, platform_id } = req.body || {};
  if (!platform || !platform_id) {
    return res.status(400).json({ error: 'platform and platform_id required' });
  }

  try {
    const result = await verifySource(platform, platform_id);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, embeddable: false, reason: e.message });
  }
}

async function verifySource(platform, id) {
  switch (platform) {
    case 'youtube':     return verifyYouTube(id);
    case 'dailymotion': return verifyDailymotion(id);
    case 'vimeo':       return verifyVimeo(id);
    case 'archive':     return verifyArchive(id);
    default:            return { ok: false, embeddable: false, reason: `unknown_platform:${platform}` };
  }
}

async function verifyYouTube(videoId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, embeddable: false, reason: 'missing_youtube_key' };

  const url = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${encodeURIComponent(videoId)}&key=${key}`;
  const r = await fetch(url);
  if (!r.ok) return { ok: false, embeddable: false, reason: `youtube_api_error:${r.status}` };

  const data = await r.json();
  const item = data.items?.[0];
  if (!item) return { ok: false, embeddable: false, reason: 'not_found' };

  const embeddable = item.status?.embeddable === true;
  const privacyStatus = item.status?.privacyStatus;
  if (privacyStatus !== 'public') {
    return { ok: false, embeddable: false, reason: `not_public:${privacyStatus}` };
  }
  return { ok: true, embeddable, reason: embeddable ? null : 'not_embeddable' };
}

async function verifyDailymotion(videoId) {
  const url = `https://api.dailymotion.com/video/${encodeURIComponent(videoId)}?fields=id,status,allow_embed,title`;
  const r = await fetch(url);
  if (!r.ok) return { ok: false, embeddable: false, reason: `dailymotion_api_error:${r.status}` };

  const data = await r.json();
  if (data.error) return { ok: false, embeddable: false, reason: `dailymotion:${data.error.message}` };
  if (data.status !== 'published') {
    return { ok: false, embeddable: false, reason: `not_published:${data.status}` };
  }
  if (!data.allow_embed) {
    return { ok: true, embeddable: false, reason: 'embed_disabled' };
  }
  return { ok: true, embeddable: true, reason: null };
}

async function verifyVimeo(videoId) {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const url = `https://api.vimeo.com/videos/${encodeURIComponent(videoId)}?fields=uri,privacy,status`;
  const r = await fetch(url, { headers });
  if (!r.ok) return { ok: false, embeddable: false, reason: `vimeo_api_error:${r.status}` };

  const data = await r.json();
  if (data.error) return { ok: false, embeddable: false, reason: `vimeo:${data.error}` };
  if (data.status !== 'available') {
    return { ok: false, embeddable: false, reason: `not_available:${data.status}` };
  }

  const embedSetting = data.privacy?.embed;
  if (embedSetting === 'nobody') {
    return { ok: true, embeddable: false, reason: 'embed_disabled' };
  }
  return { ok: true, embeddable: true, reason: null };
}

async function verifyArchive(identifier) {
  const url = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const r = await fetch(url);
  if (!r.ok) return { ok: false, embeddable: false, reason: `archive_api_error:${r.status}` };

  const data = await r.json();
  if (!data?.metadata?.identifier) {
    return { ok: false, embeddable: false, reason: 'not_found' };
  }

  // Check for at least one video file
  const files = data.files || [];
  const videoExts = ['.mp4', '.ogv', '.webm', '.mpeg', '.avi', '.mov'];
  const hasVideo = files.some(f => videoExts.some(ext => f.name?.toLowerCase().endsWith(ext)));
  if (!hasVideo) {
    return { ok: false, embeddable: false, reason: 'no_video_files' };
  }

  return { ok: true, embeddable: true, reason: null };
}
