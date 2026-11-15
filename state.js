// Pure state helpers + chrome.storage persistence.
export const WIDGET_SIZES = { clock: [[2, 2]], date: [[2, 2]], todo: [[2, 2]], note: [[4, 2], [2, 2]], weather: [[2, 2], [4, 2]] };
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
    settings: { search: true, engine: 'google', dim: 0.2, blur: 0, city: null },
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
    return url ? { id, type: 'link', url, title: str(i.title, 60) || new URL(url).hostname } : null;
  }
  if (allowWidget && i.type === 'folder' && Array.isArray(i.items)) {
    const items = i.items.slice(0, 100).map(x => cleanItem(x, false)).filter(Boolean); // links only, no nesting
    return items.length ? { id, type: 'folder', title: str(i.title, 40) || 'Thư mục', items } : null;
  }
  if (allowWidget && i.type === 'widget' && WIDGET_SIZES[i.kind]) {
    const ok = WIDGET_SIZES[i.kind].find(([w, h]) => w === i.w && h === i.h) || WIDGET_SIZES[i.kind][0];
    return { id, type: 'widget', kind: i.kind, w: ok[0], h: ok[1] };
  }
  return null;
}

const cleanCity = c => {
  if (!isObj(c)) return null;
  const lat = num(c.lat, -90, 90, NaN), lon = num(c.lon, -180, 180, NaN);
  return str(c.name, 80) && !isNaN(lat) && !isNaN(lon) ? { name: str(c.name, 80), lat, lon } : null;
};

// Untrusted input (imported JSON). Throws on wrong shape, drops bad items/unknown fields.
export function validateState(obj) {
  if (!isObj(obj) || !Array.isArray(obj.pages) || !Array.isArray(obj.dock)) throw new Error('File không đúng định dạng Mono New Tab');
  const pages = obj.pages.filter(Array.isArray).map(p => p.map(i => cleanItem(i, true)).filter(Boolean));
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
  };
  return { version: 1, pages, dock, notes, todos, settings };
}

export async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return defaultState();
  try { return validateState(state); } catch { return defaultState(); }
}

export const saveState = state => chrome.storage.local.set({ state });
