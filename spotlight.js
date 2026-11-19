// Spotlight: the search bar also finds open tabs, shortcuts and — with the optional permission —
// bookmarks and history. Ctrl/⌘+K or "/" opens it, even when the search bar is hidden.
import { t } from './i18n.js';
import { normalizeUrl } from './state.js';

// Lowercase, no Vietnamese diacritics: "ghi chu" finds "Ghi chú".
export const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

// 3 = starts with, 2 = a word starts with, 1 = contains, 0 = no match. q must already be folded.
export function score(text, q) {
  const s = fold(text);
  if (!q || !s.includes(q)) return 0;
  if (s.startsWith(q)) return 3;
  return s.split(/[^\p{L}\p{N}]+/u).some(w => w.startsWith(q)) ? 2 : 1;
}

const KINDS = ['tab', 'link', 'bookmark', 'history'];
const bare = url => url.replace(/^https?:\/\/(www\.)?/, '');

// [{kind, title, url}] → best matches first, one row per URL.
export function rank(cands, query, n = 8) {
  const q = fold(query.trim()), seen = new Set();
  if (!q) return [];
  return cands
    .map(c => ({ ...c, s: Math.max(score(c.title, q), score(bare(c.url), q)) }))
    .filter(c => c.s)
    .sort((a, b) => b.s - a.s || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))
    .filter(c => !seen.has(c.url) && seen.add(c.url))
    .slice(0, n);
}

// Typed something address-like ("vnexpress.net", "http://…") → offer to open it directly.
export const typedUrl = q => (/^https?:\/\//i.test(q) || /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(q) ? normalizeUrl(q) : null);

// What Enter does with typed text: an address opens, else the best match, else a web search.
export const bestAction = (text, ranked) => {
  const url = typedUrl(text.trim());
  return url ? { kind: 'go', url } : ranked[0] || { kind: 'web', title: text.trim() };
};

// Omnibox suggestion text (XML: Chrome renders <dim>/<url> tags, so user text must be escaped).
const xml = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const omniText = (r, label) => `${xml(r.title || bare(r.url))} <dim>· ${xml(label)}</dim> <url>${xml(bare(r.url).slice(0, 80))}</url>`;

export const MORE = { permissions: ['bookmarks', 'history'] };
const web = u => /^https?:\/\//i.test(u || '');

export function initSpotlight({ links, tabs, switchTo, favicon, engineName, openUrl = u => { location.href = u; } }) {
  const form = document.querySelector('#search'), input = form.q, list = document.querySelector('#results');
  let rows = [], sel = 0, seq = 0;

  async function update() {
    const q = input.value.trim(), my = ++seq;
    const cands = [
      ...tabs().filter(tb => tb.url).map(tb => ({ kind: 'tab', title: tb.title, url: tb.url, tab: tb })),
      ...links().map(l => ({ kind: 'link', title: l.title, url: l.url })),
    ];
    if (q && await chrome.permissions.contains(MORE).catch(() => false)) {
      const [bm, hi] = await Promise.all([
        chrome.bookmarks.search(q).catch(() => []),
        chrome.history.search({ text: q, maxResults: 30, startTime: 0 }).catch(() => []),
      ]);
      cands.push(...bm.filter(b => web(b.url)).map(b => ({ kind: 'bookmark', title: b.title, url: b.url })),
        ...hi.filter(x => web(x.url)).map(x => ({ kind: 'history', title: x.title, url: x.url })));
    }
    if (my !== seq) return; // a newer keystroke won
    rows = rank(cands, q);
    const url = typedUrl(q);
    if (url) rows.unshift({ kind: 'go', title: url, url });
    if (q) rows.push({ kind: 'web', title: q });
    sel = 0;
    draw();
  }

  function draw() {
    list.hidden = !rows.length;
    list.replaceChildren(...rows.map((r, i) => {
      const li = document.createElement('li'), img = new Image(), txt = document.createElement('span');
      li.className = 'res' + (i === sel ? ' sel' : '');
      li.role = 'option';
      li.ariaSelected = i === sel;
      li.dataset.i = i;
      img.alt = '';
      img.src = r.kind === 'web' ? 'icons/icon32.png' : favicon(r.url);
      const title = document.createElement('b'), sub = document.createElement('small');
      title.textContent = r.kind === 'web' ? t('spot.web', { q: r.title, engine: engineName() }) : r.title || bare(r.url);
      sub.textContent = r.kind === 'web' ? '' : `${t('spot.' + r.kind)} · ${bare(r.url).slice(0, 80)}`;
      txt.append(title, sub);
      li.append(img, txt);
      return li;
    }));
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
  }

  function activate(r) {
    if (!r) return;
    if (r.kind === 'tab') return close(), switchTo(r.tab);
    openUrl(r.kind === 'web' ? `${form.action}?q=${encodeURIComponent(r.title)}` : r.url);
  }

  const open = () => { document.body.classList.add('spot'); input.focus(); input.select(); update(); };
  function close() {
    document.body.classList.remove('spot');
    list.hidden = true;
    if (document.activeElement === input) input.blur();
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(rows.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      draw();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (input.value) { input.value = ''; update(); } else close();
    }
  });
  form.addEventListener('submit', e => { e.preventDefault(); activate(rows[sel]); });
  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', e => activate(rows[e.target.closest('.res')?.dataset.i]));
  list.addEventListener('mousemove', e => {
    const i = +e.target.closest('.res')?.dataset.i;
    if (i >= 0 && i !== sel) { sel = i; draw(); }
  });
  input.addEventListener('blur', () => { document.body.classList.remove('spot'); list.hidden = true; });
  document.addEventListener('keydown', e => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
      e.preventDefault();
      open();
    }
  });
  return { open };
}
