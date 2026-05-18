/* ── XSS-safe string escaping ────────────────────────────── */
export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── BADGES ───────────────────────────────────────────────── */
const ORIGIN_MAP = {
  turkish:  { label:'🇹🇷 تركي',   cls:'b-tr' },
  indian:   { label:'🇮🇳 هندي',   cls:'b-in' },
  korean:   { label:'🇰🇷 كوري',   cls:'b-ko' },
  american: { label:'🇺🇸 أمريكي', cls:'b-us' },
  moroccan: { label:'🇲🇦 مغربي',  cls:'b-ma' },
  chinese:  { label:'🇨🇳 صيني',   cls:'b-cn' },
  french:   { label:'🇫🇷 فرنسي',  cls:'b-fr' },
  other:    { label:'🌍 أخرى',    cls:'b-ar' }
};
const LANG_MAP = {
  darija:   { label:'🇲🇦 دارجة',      cls:'b-ma' },
  ar_dubbed:{ label:'عربي مدبلج',      cls:'b-ar' },
  fr_dubbed:{ label:'🇫🇷 فرنسي مدبلج', cls:'b-fr' }
};
const CAT_MAP = {
  drama:'دراما', action:'أكشن', comedy:'كوميدي',
  horror:'رعب', romance:'رومانسي', 'sci-fi':'خيال علمي',
  animation:'رسوم متحركة', documentary:'وثائقي', thriller:'إثارة'
};

export function originBadge(o) {
  const m = ORIGIN_MAP[o] || { label: esc(o), cls:'b-ar' };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
export function langBadge(l) {
  const m = LANG_MAP[l] || { label: esc(l), cls:'b-ar' };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
export function catBadge(c) {
  return CAT_MAP[c] ? `<span class="badge b-cat">${CAT_MAP[c]}</span>` : '';
}
export function typeBadge(t) {
  return t === 'film'
    ? '<span class="badge b-film">🎬 فيلم</span>'
    : '<span class="badge b-ser">📺 مسلسل</span>';
}
export function epsBadge(avail, total) {
  if (!avail) return '';
  const pct = total ? Math.round(avail/total*100) : 0;
  const cls = pct >= 85 ? 'b-complete' : pct >= 50 ? 'b-in' : 'b-ep';
  const label = total ? `${avail}/${total} حلقة` : `${avail} حلقة`;
  return `<span class="badge ${cls}">${label}</span>`;
}
export function newBadge(createdAt) {
  if (!createdAt) return '';
  const days = (Date.now() - new Date(createdAt)) / 86400000;
  return days <= 7 ? '<span class="badge b-new">جديد</span>' : '';
}
export function originLabel(o) { return ORIGIN_MAP[o]?.label || o; }
export function langLabel(l)   { return LANG_MAP[l]?.label || l; }

/* ── CONTINUE WATCHING ───────────────────────────────────── */
const CW_KEY  = 'mawso3a_cw_v2';
const FAV_KEY = 'mawso3a_fav_v2';
const CW_MAX  = 50;

export const CW = {
  save(item) {
    try {
      const cw = CW.getAll();
      cw[item.id] = { ...item, lastWatched: Date.now() };
      const keys = Object.keys(cw).sort((a,b) => (cw[b].lastWatched||0) - (cw[a].lastWatched||0));
      if (keys.length > CW_MAX) keys.slice(CW_MAX).forEach(k => delete cw[k]);
      localStorage.setItem(CW_KEY, JSON.stringify(cw));
    } catch {}
  },
  remove(id) {
    try {
      const cw = CW.getAll();
      delete cw[id];
      localStorage.setItem(CW_KEY, JSON.stringify(cw));
    } catch {}
  },
  getAll() {
    try { return JSON.parse(localStorage.getItem(CW_KEY) || '{}'); } catch { return {}; }
  },
  getRecent(limit = 12) {
    return Object.values(CW.getAll())
      .sort((a,b) => (b.lastWatched||0) - (a.lastWatched||0))
      .slice(0, limit);
  }
};

export const FAV = {
  toggle(id) {
    try {
      const favs = FAV.getAll();
      if (favs[id]) delete favs[id];
      else favs[id] = Date.now();
      localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      return !!favs[id];
    } catch { return false; }
  },
  is(id) {
    try { return !!JSON.parse(localStorage.getItem(FAV_KEY) || '{}')[id]; } catch { return false; }
  },
  getAll() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch { return {}; }
  },
  getIds() {
    return Object.keys(FAV.getAll());
  }
};

/* ── TOAST ───────────────────────────────────────────────── */
export function toast(msg, type = 'info', duration = 3000) {
  let container = document.getElementById('toasts');
  if (!container) {
    container = Object.assign(document.createElement('div'), { id: 'toasts', className: 'toast-container' });
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

/* ── ANIMATE COUNTER ─────────────────────────────────────── */
export function animateCounter(el, target, duration = 1500) {
  if (!el || !target) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * ease).toLocaleString('ar');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── URL HELPERS ─────────────────────────────────────────── */
export function filmHref(item)   { return `film-detail.html?id=${encodeURIComponent(item.id)}`; }
export function seriesHref(item) { return `series-detail.html?id=${encodeURIComponent(item.id)}`; }
export function itemHref(item)   { return item.type === 'film' ? filmHref(item) : seriesHref(item); }

/* ── CARD HTML (row/slider) ──────────────────────────────── */
export function cardHTML(item) {
  const href  = itemHref(item);
  const title = esc(item.title_ar);
  const thumb = item.poster_url
    ? `<img class="card-thumb" src="${esc(item.poster_url)}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-thumb-ph>${item.type==='series'?'📺':'🎬'}</div>'">`
    : `<div class="card-thumb-ph">${item.type==='series'?'📺':'🎬'}</div>`;
  const nb = newBadge(item.created_at);
  return `<a href="${href}" class="card">
    ${thumb}
    ${nb ? `<span class="card-corner-badge">${nb}</span>` : ''}
    <div class="card-play">▶</div>
    <div class="card-overlay">
      <div class="card-info">
        <div class="card-title">${title}</div>
        <div class="card-badges">${originBadge(item.origin)}${langBadge(item.language)}</div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-body-title">${title}</div>
      <div class="card-body-badges">${originBadge(item.origin)}</div>
    </div>
  </a>`;
}

/* ── GRID CARD HTML (catalog pages) ─────────────────────── */
export function gridCardHTML(item) {
  const href   = itemHref(item);
  const isFav  = FAV.is(item.id);
  const title  = esc(item.title_ar);
  const thumb  = item.poster_url
    ? `<img class="g-thumb" src="${esc(item.poster_url)}" alt="${title}" loading="lazy" onerror="this.parentElement.querySelector('.g-thumb-ph')?.style.setProperty('display','flex');this.remove()">`
    : '';
  const eps    = item.type === 'series' ? epsBadge(item.avail_eps, item.total_eps) : '';
  const nb     = newBadge(item.created_at);
  const year   = item.year ? `<span class="badge b-year">${item.year}</span>` : '';
  return `<a href="${href}" class="grid-card">
    ${thumb}
    <div class="g-thumb-ph" style="${item.poster_url?'display:none':''}">${item.type==='series'?'📺':'🎬'}</div>
    <div class="g-play">▶</div>
    ${nb ? `<span class="card-corner-badge">${nb}</span>` : ''}
    <div class="g-overlay">
      <div class="g-info">
        <div class="g-info-title">${title}</div>
        <div class="g-info-badges">${originBadge(item.origin)}${langBadge(item.language)}${eps}</div>
      </div>
    </div>
    <button class="fav-btn ${isFav?'on':''}" data-id="${esc(item.id)}"
      title="${isFav?'إزالة من المفضلة':'إضافة للمفضلة'}"
      onclick="event.preventDefault();window.__toggleFav(this,'${esc(item.id)}')">${isFav?'❤️':'🤍'}</button>
    <div class="g-body">
      <div class="g-title">${title}</div>
      <div class="g-badges">${originBadge(item.origin)}${langBadge(item.language)}${eps}${year}</div>
    </div>
  </a>`;
}

window.__toggleFav = function(btn, id) {
  const on = FAV.toggle(id);
  btn.textContent = on ? '❤️' : '🤍';
  btn.classList.toggle('on', on);
  btn.title = on ? 'إزالة من المفضلة' : 'إضافة للمفضلة';
  toast(on ? '❤️ أضيف للمفضلة' : '🤍 أزيل من المفضلة', on ? 'success' : 'info');
};

/* ── SKELETON LOADERS ────────────────────────────────────── */
export function skeletonGrid(n = 24) {
  return Array.from({length:n}, () => `
    <div class="skel"><div class="skel-poster"></div>
    <div class="skel-body"><div class="skel-line"></div><div class="skel-line s"></div></div></div>`
  ).join('');
}

export function skeletonRow(n = 8, width = '155px') {
  return Array.from({length:n}, () => `
    <div class="skel card" style="width:${width}">
      <div class="skel-poster"></div>
      <div class="skel-body"><div class="skel-line"></div><div class="skel-line s"></div></div>
    </div>`
  ).join('');
}

/* ── DURATION FORMATTER ─────────────────────────────────── */
export function formatDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}س ${m}د` : `${m} دقيقة`;
}

/* ── INFINITE SCROLL HELPER ─────────────────────────────── */
export function onScrollEnd(callback, threshold = 400) {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - threshold) {
        callback();
      }
      ticking = false;
    });
  }, { passive: true });
}
