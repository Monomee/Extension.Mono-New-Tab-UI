// Pure state helpers + chrome.storage persistence.
import { t, browserLang, LANGS } from './i18n.js';
import { MODES, LOCK_MINUTES } from './device.js';
export const WIDGET_SIZES = { clock: [[2, 2]], date: [[2, 2], [4, 4]], todo: [[2, 2], [2, 4], [4, 4]], note: [[4, 2], [2, 2], [4, 4]], weather: [[2, 2], [4, 2], [4, 4]] }; // first = default
export const ENGINES = {
  google: 'https://www.google.com/search',
  bing: 'https://www.bing.com/search',
  duckduckgo: 'https://duckduckgo.com/',
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function normalizeUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

const link = (url, title) => ({ id: uid(), type: 'link', url, title });
const widget = (kind, w = 2, h = 2) => ({ id: uid(), type: 'widget', kind, w, h });

export function defaultState() {
  return {
    version: 1,
    pages: [[
      widget('clock'), widget('date'),
      link('https://github.com/', 'GitHub'), link('https://www.reddit.com/', 'Reddit'),
      widget('note', 4, 2), widget('todo'),
    ]],
    dock: [
      link('https://www.google.com/', 'Google'), link('https://www.youtube.com/', 'YouTube'),
      link('https://mail.google.com/', 'Gmail'), link('https://www.facebook.com/', 'Facebook'),
    ],
    notes: {},
    todos: {},
    settings: { search: true, engine: 'google', dim: 0.2, blur: 0, city: null, lang: browserLang(), switchTab: true, afterSwitch: 'close', mode: 'ios', theme: 'auto', focus: false, lock: 5 },
  };
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, dflt) => (typeof v === 'number' && v >= lo && v <= hi ? v : dflt);

function cleanItem(i, allowWidget) {
  if (!isObj(i)) return null;
  const id = str(i.id, 40) || uid();
  if (i.type === 'link') {
    const url = normalizeUrl(i.url);
    if (!url) return null;
    const out = { id, type: 'link', url, title: str(i.title, 60) || new URL(url).hostname };
    const bg = str(i.bg, 10).toLowerCase();
    if (/^(light|dark|#[0-9a-f]{6})$/.test(bg)) out.bg = bg;
    const icon = i.icon === 'upload' ? 'upload' : normalizeUrl(i.icon); // 'upload' = blob in IndexedDB
    if (icon) out.icon = icon;
    return out;
  }
  if (allowWidget && i.type === 'folder' && Array.isArray(i.items)) {
    const items = i.items.slice(0, 100).map(x => cleanItem(x, false)).filter(Boolean); // links only, no nesting
    return items.length ? { id, type: 'folder', title: str(i.title, 40) || t('folder.default'), items } : null;
  }
  if (allowWidget && i.type === 'widget' && WIDGET_SIZES[i.kind]) {
    const ok = WIDGET_SIZES[i.kind].find(([w, h]) => w === i.w && h === i.h) || WIDGET_SIZES[i.kind][0];
    return { id, type: 'widget', kind: i.kind, w: ok[0], h: ok[1] };
  }
  return null;
}

// RGBA pixels of a square icon → true when it's a light logo on transparency (e.g. GitHub/ChatGPT
// favicons in OS dark mode) that would vanish on the default white tile.
export function needsDarkTile(rgba) {
  let opaque = 0, light = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    opaque++;
    if ((0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255 > 0.8) light++;
  }
  const total = rgba.length / 4;
  return opaque > 0 && opaque < total * 0.9 && light / opaque > 0.6; // full-bleed icons keep their own bg
}

// Free grid placement: page items carry their top-left cell (x, y); links are 1×1.
export const sizeOf = i => (i.type === 'widget' ? [i.w, i.h] : [1, 1]);
const hits = (a, ax, ay, b) => {
  const [aw, ah] = sizeOf(a), [bw, bh] = sizeOf(b);
  return ax < b.x + bw && b.x < ax + aw && ay < b.y + bh && b.y < ay + ah;
};
// Items `it` would overlap if it sat at (x, y).
export const overlaps = (items, it, x, y) => items.filter(o => o !== it && Number.isInteger(o.x) && hits(it, x, y, o));

// Keep each item's saved cell when it still fits; the rest take the first free cell (row-major).
// Returns the items that don't fit; caller moves them to the next page.
export function placeItems(items, cols, rows) {
  const placed = [], pending = [], over = [];
  const fits = (it, x, y) => {
    const [w, h] = sizeOf(it);
    return x >= 0 && y >= 0 && x + w <= cols && y + h <= rows && !placed.some(o => hits(it, x, y, o));
  };
  for (const it of items) (fits(it, it.x, it.y) ? placed : pending).push(it);
  for (const it of pending) {
    const [w, h] = sizeOf(it);
    // ponytail: bigger than the whole grid (tiny window) → pinned top-left, may overlap
    if (w > cols || h > rows) { Object.assign(it, { x: 0, y: 0 }); placed.push(it); continue; }
    let spot = null;
    for (let y = 0; !spot && y + h <= rows; y++) for (let x = 0; x + w <= cols; x++) if (fits(it, x, y)) { spot = { x, y }; break; }
    if (spot) { Object.assign(it, spot); placed.push(it); } else over.push(it);
  }
  return over;
}

const cleanCity = c => {
  if (!isObj(c)) return null;
  const lat = num(c.lat, -90, 90, NaN), lon = num(c.lon, -180, 180, NaN);
  return str(c.name, 80) && !isNaN(lat) && !isNaN(lon) ? { name: str(c.name, 80), lat, lon } : null;
};

// Untrusted input (imported JSON). Throws on wrong shape, drops bad items/unknown fields.
export function validateState(obj) {
  if (!isObj(obj) || !Array.isArray(obj.pages) || !Array.isArray(obj.dock)) throw new Error('badFormat'); // app shows t('import.badFormat')
  const cell = v => Number.isInteger(v) && v >= 0 && v < 100;
  const withPos = (out, i) => (out && cell(i.x) && cell(i.y) ? { ...out, x: i.x, y: i.y } : out);
  const pages = obj.pages.filter(Array.isArray).map(p => p.map(i => withPos(cleanItem(i, true), i)).filter(Boolean));
  if (!pages.length) pages.push([]);
  const dock = obj.dock.map(i => cleanItem(i, false)).filter(Boolean);
  const ids = new Set(pages.flat().filter(i => i.type === 'widget').map(i => i.id));

  const notes = {}, todos = {};
  for (const [k, v] of Object.entries(isObj(obj.notes) ? obj.notes : {}))
    if (ids.has(k) && typeof v === 'string') notes[k] = v.slice(0, 20000);
  for (const [k, v] of Object.entries(isObj(obj.todos) ? obj.todos : {}))
    if (ids.has(k) && Array.isArray(v))
      todos[k] = v.filter(isObj).map(t => ({ id: str(t.id, 40) || uid(), text: str(t.text, 500), done: t.done === true }));

  const s = isObj(obj.settings) ? obj.settings : {};
  const settings = {
    search: s.search !== false,
    engine: ENGINES[s.engine] ? s.engine : 'google',
    dim: num(s.dim, 0, 0.8, 0.2),
    blur: num(s.blur, 0, 30, 0),
    city: cleanCity(s.city),
    lang: LANGS.includes(s.lang) ? s.lang : 'vi', // missing → vi: existing installs predate the setting
    switchTab: s.switchTab !== false,
    afterSwitch: s.afterSwitch === 'keep' ? 'keep' : 'close',
    mode: MODES.includes(s.mode) ? s.mode : 'ios',
    theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
    focus: s.focus === true,
    lock: LOCK_MINUTES.includes(s.lock) ? s.lock : 5,
  };
  return { version: 1, pages, dock, notes, todos, settings };
}

export async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return defaultState();
  try { return validateState(state); } catch { return defaultState(); }
}

export const saveState = state => chrome.storage.local.set({ state });
