/* ── BADGES ───────────────────────────────────── */
const ORIGIN_MAP = {
  turkish:  { label:'🇹🇷 تركي',   cls:'b-tr' },
  indian:   { label:'🇮🇳 هندي',   cls:'b-in' },
  korean:   { label:'🇰🇷 كوري',   cls:'b-ko' },
  american: { label:'🇺🇸 أمريكي', cls:'b-us' },
  moroccan: { label:'🇲🇦 مغربي',  cls:'b-ma' }
};
const LANG_MAP = {
  darija:   { label:'🇲🇦 دارجة',      cls:'b-ar' },
  ar_dubbed:{ label:'عربي مدبلج',      cls:'b-ar' },
  fr_dubbed:{ label:'🇫🇷 فرنسي مدبلج', cls:'b-ar' }
};
const CAT_MAP = {
  drama:'دراما', action:'أكشن', comedy:'كوميدي',
  horror:'رعب', romance:'رومانسي', 'sci-fi':'خيال علمي', animation:'أنيماشن'
};

export function originBadge(o) {
  const m = ORIGIN_MAP[o] || { label: o, cls:'b-ar' };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
export function langBadge(l) {
  const m = LANG_MAP[l] || { label: l, cls:'b-ar' };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
export function catBadge(c) {
  return CAT_MAP[c] ? `<span class="badge b-film">${CAT_MAP[c]}</span>` : '';
}
export function typeBadge(t) {
  return t === 'film'
    ? '<span class="badge b-film">فيلم</span>'
    : '<span class="badge b-ser">مسلسل</span>';
}
export function epsBadge(avail, total) {
  if (!avail) return '';
  const pct = total ? Math.round(avail/total*100) : 0;
  const cls = pct >= 85 ? 'b-tr' : pct >= 60 ? 'b-in' : 'b-ep';
  return `<span class="badge ${cls}">${avail}${total?'/'+total:''} حلقة</span>`;
}
export function originLabel(o) { return ORIGIN_MAP[o]?.label || o; }
export function langLabel(l)   { return LANG_MAP[l]?.label || l; }

/* ── CONTINUE WATCHING ───────────────────────── */
const CW_KEY = 'mawso3a_cw';
const FAV_KEY = 'mawso3a_fav';

export const CW = {
  save(item) {
    const cw = CW.getAll();
    cw[item.id] = { ...item, lastWatched: Date.now() };
    localStorage.setItem(CW_KEY, JSON.stringify(cw));
  },
  remove(id) {
    const cw = CW.getAll();
    delete cw[id];
    localStorage.setItem(CW_KEY, JSON.stringify(cw));
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
    const favs = FAV.getAll();
    if (favs[id]) delete favs[id];
    else favs[id] = true;
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return !!favs[id];
  },
  is(id) {
    try { return !!JSON.parse(localStorage.getItem(FAV_KEY) || '{}')[id]; } catch { return false; }
  },
  getAll() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch { return {}; }
  }
};

/* ── TOAST ───────────────────────────────────── */
export function toast(msg, type = 'info') {
  let container = document.getElementById('toasts');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toasts';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── ANIMATE COUNTER ─────────────────────────── */
export function animateCounter(el, target, duration = 1500) {
  const start = performance.now();
  const from = 0;
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * ease).toLocaleString('ar');
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── URL HELPERS ─────────────────────────────── */
export function filmHref(item) {
  return `watch.html?id=${encodeURIComponent(item.id)}`;
}
export function seriesHref(item) {
  return `series-detail.html?id=${encodeURIComponent(item.id)}`;
}
export function itemHref(item) {
  return item.type === 'film' ? filmHref(item) : seriesHref(item);
}

/* ── CARD HTML ───────────────────────────────── */
export function cardHTML(item, opts = {}) {
  const href = itemHref(item);
  const thumb = item.poster_url
    ? `<img class="card-thumb" src="${item.poster_url}" alt="${item.title_ar}" loading="lazy"/>`
    : `<div class="card-thumb-ph">${item.type==='series'?'📺':'🎬'}</div>`;
  return `<a href="${href}" class="card">
    ${thumb}
    <div class="card-play">▶</div>
    <div class="card-overlay">
      <div class="card-info">
        <div class="card-title">${item.title_ar}</div>
        <div class="card-badges">${originBadge(item.origin)}${langBadge(item.language)}</div>
      </div>
    </div>
    ${opts.body !== false ? `
    <div class="card-body">
      <div class="card-body-title">${item.title_ar}</div>
      <div class="card-body-badges">${originBadge(item.origin)}</div>
    </div>` : ''}
  </a>`;
}

export function gridCardHTML(item) {
  const href = itemHref(item);
  const isFav = FAV.is(item.id);
  const thumb = item.poster_url
    ? `<img class="g-thumb" src="${item.poster_url}" alt="${item.title_ar}" loading="lazy"/>`
    : `<div class="g-thumb-ph">${item.type==='series'?'📺':'🎬'}</div>`;
  const eps = item.type==='series' ? epsBadge(item.avail_eps, item.total_eps) : '';
  return `<a href="${href}" class="grid-card">
    ${thumb}
    <div class="g-play">▶</div>
    <div class="g-overlay">
      <div class="g-info">
        <div class="g-info-title">${item.title_ar}</div>
        <div class="g-info-badges">${originBadge(item.origin)}${langBadge(item.language)}${eps}</div>
      </div>
    </div>
    <button class="fav-btn ${isFav?'on':''}" data-id="${item.id}" title="${isFav?'إزالة من المفضلة':'إضافة للمفضلة'}" onclick="event.preventDefault();window.__toggleFav(this,'${item.id}')">${isFav?'❤️':'🤍'}</button>
    <div class="g-body">
      <div class="g-title">${item.title_ar}</div>
      <div class="g-badges">${originBadge(item.origin)}${langBadge(item.language)}${eps}</div>
    </div>
  </a>`;
}

// Global fav toggle handler
window.__toggleFav = function(btn, id) {
  const on = FAV.toggle(id);
  btn.textContent = on ? '❤️' : '🤍';
  btn.classList.toggle('on', on);
  toast(on ? '❤️ أضيف للمفضلة' : '🤍 أزيل من المفضلة', on ? 'success' : 'info');
};

export function skeletonGrid(n = 24) {
  return Array.from({length:n},()=>`
    <div class="skel"><div class="skel-poster"></div><div class="skel-body"><div class="skel-line"></div><div class="skel-line s"></div></div></div>`).join('');
}
export function skeletonRow(n = 8, width = '155px') {
  return Array.from({length:n},()=>`
    <div class="skel card" style="width:${width}">
      <div class="skel-poster"></div>
      <div class="skel-body"><div class="skel-line"></div><div class="skel-line s"></div></div>
    </div>`).join('');
}
