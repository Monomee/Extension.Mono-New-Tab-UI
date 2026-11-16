/* global Sortable */
import { loadState, saveState, validateState, normalizeUrl, needsDarkTile, uid, ENGINES, WIDGET_SIZES } from './state.js';
import { renderWidget, tick } from './widgets.js';
import { t, setLang, translateDom } from './i18n.js';

const $ = s => document.querySelector(s);
const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const $pages = $('#pages'), $dockList = $('#dockList'), $dots = $('#dots');

/* ---------- IndexedDB: wallpaper (Blob | {url} | {daily}), icons (link id → Blob) ---------- */
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open('mono', 2);
  r.onupgradeneeded = () => {
    for (const s of ['wallpaper', 'icons']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const idb = async (store, mode, op) => {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const req = op(tx.objectStore(store));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
};
const getWall = () => idb('wallpaper', 'readonly', s => s.get('current'));
const putWall = v => idb('wallpaper', 'readwrite', s => (v ? s.put(v, 'current') : s.delete('current')));

// Uploaded link icons, kept as object URLs for synchronous rendering.
const iconUrls = new Map();
async function loadIcons() {
  const [keys, blobs] = await Promise.all([
    idb('icons', 'readonly', s => s.getAllKeys()),
    idb('icons', 'readonly', s => s.getAll()),
  ]).catch(() => [[], []]);
  for (const u of iconUrls.values()) URL.revokeObjectURL(u);
  iconUrls.clear();
  keys.forEach((k, i) => iconUrls.set(k, URL.createObjectURL(blobs[i])));
}
async function setIcon(id, blob) {
  if (iconUrls.has(id)) URL.revokeObjectURL(iconUrls.get(id));
  iconUrls.delete(id);
  await idb('icons', 'readwrite', s => (blob ? s.put(blob, id) : s.delete(id)));
  if (blob) iconUrls.set(id, URL.createObjectURL(blob));
}
const loads = src => new Promise(r => {
  const i = new Image();
  i.onload = () => r(true);
  i.onerror = () => r(false);
  i.src = src;
});

// Bing image of the day, cached per local day. Offline → yesterday's image; nothing cached → gradient.
async function bingToday() {
  const day = new Date().toDateString();
  const { bingCache: c } = await chrome.storage.local.get('bingCache');
  if (c?.day === day) return c;
  try {
    const d = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=vi-VN').then(r => r.json());
    const img = d.images[0];
    const url = normalizeUrl('https://www.bing.com' + img.urlbase + '_1920x1080.jpg');
    if (!url?.startsWith('https://www.bing.com/')) throw new Error('bad bing url');
    const out = { day, url, caption: String(img.copyright || '').slice(0, 200), link: normalizeUrl(img.copyrightlink) };
    await chrome.storage.local.set({ bingCache: out });
    return out;
  } catch {
    return c || null;
  }
}

let wallSrc;
async function applyWall() {
  const v = await getWall().catch(() => null);
  if (wallSrc?.startsWith('blob:')) URL.revokeObjectURL(wallSrc);
  const daily = v?.daily ? await bingToday() : null;
  wallSrc = v instanceof Blob ? URL.createObjectURL(v) : daily ? daily.url : v?.url;
  const ok = wallSrc ? await loads(wallSrc) : false;
  $('#wall').style.backgroundImage = ok ? `url("${wallSrc}")` : ''; // fail → CSS gradient
  const cap = $('#wallCaption');
  cap.hidden = !(ok && daily?.caption);
  cap.textContent = daily?.caption || '';
  if (daily?.link) cap.href = daily.link;
  else cap.removeAttribute('href');
}
applyWall(); // start before state loads to avoid a flash

/* ---------- state ---------- */
const state = await loadState();
const save = () => saveState(state);
const ctx = { state, save, render: () => render() };
let editing = false, sortables = [];

const replaceState = next => {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
};
const allItems = () => {
  const top = [...state.pages.flat(), ...state.dock];
  return [...top, ...top.flatMap(i => i.items || [])];
};
// Folder with 0 items disappears, with 1 item dissolves back into a link (iOS behaviour).
const normalizeFolders = () => {
  state.pages = state.pages.map(p => p.flatMap(i => (i.type !== 'folder' || i.items.length > 1 ? [i] : i.items)));
};
const findItem = id => allItems().find(i => i.id === id);

function applySettings() {
  const s = state.settings, root = document.documentElement.style;
  root.setProperty('--dim', s.dim);
  root.setProperty('--bg-blur', s.blur + 'px');
  document.body.classList.toggle('no-search', !s.search);
  $('#search').action = ENGINES[s.engine];
  setLang(s.lang);
  translateDom();
}

/* ---------- items ---------- */
const faviconUrl = u => `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(u)}&size=64`;

const hostOf = url => new URL(url).hostname.replace(/^www\./, '');
const hueOf = s => {
  let hash = 0;
  for (const c of s) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
};
function letterIcon(icon, item, cls = 'icon letter') {
  const host = hostOf(item.url);
  icon.className = cls;
  icon.style.background = `hsl(${hueOf(host)} 62% 52%)`;
  icon.textContent = (item.title || host)[0].toUpperCase();
}

// Auto contrast: sample the loaded image; cross-origin images (tainted canvas) keep the white tile.
const darkCache = new Map();
function wantsDark(img) {
  if (!darkCache.has(img.src)) {
    let dark = false;
    try {
      const n = 32, c = document.createElement('canvas');
      c.width = c.height = n;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, n, n);
      dark = needsDarkTile(g.getImageData(0, 0, n, n).data);
    } catch { /* tainted */ }
    darkCache.set(img.src, dark);
  }
  return darkCache.get(img.src);
}

const iconSrcOf = link => (link.icon === 'upload' ? iconUrls.get(link.id) : link.icon);

// Paint a link's tile: custom icon or favicon, background per link.bg ('light'|'dark'|'#hex'|auto).
function paintIcon(box, link, src = iconSrcOf(link), base = 'icon') {
  box.className = base;
  box.style.background = '';
  box.replaceChildren();
  if (link.bg === 'dark') box.classList.add('dark');
  else if (link.bg?.startsWith('#')) box.style.background = link.bg;
  const img = new Image();
  img.alt = '';
  if (src) img.className = 'custom';
  img.onload = () => { if (!link.bg && wantsDark(img)) box.classList.add('dark'); };
  img.onerror = () => {
    if (src) return paintIcon(box, link, null, base); // broken custom icon → favicon
    letterIcon(box, link, base + ' letter');
    if (link.bg === 'dark') box.style.background = '#1c1c1e'; // chosen bg beats the hashed colour
    else if (link.bg?.startsWith('#')) box.style.background = link.bg;
  };
  img.src = src || faviconUrl(link.url);
  box.append(img);
}
const miniIcon = link => {
  const box = h('span', 'mini');
  paintIcon(box, link, undefined, 'mini');
  return box;
};

function itemEl(item) {
  const el = h('div', 'item ' + item.type);
  el.dataset.id = item.id;
  el.dataset.type = item.type;
  if (item.type === 'link') {
    const a = h('a');
    a.href = item.url;
    a.title = item.title;
    a.draggable = false;
    const icon = h('span');
    paintIcon(icon, item);
    a.append(icon, h('span', 'label', item.title));
    el.append(a);
  } else if (item.type === 'folder') {
    const open = h('div', 'open'); // not a <button>: long-press must work on it
    open.role = 'button';
    open.tabIndex = 0;
    open.title = item.title;
    const icon = h('span', 'icon folder-icon');
    icon.append(...item.items.slice(0, 9).map(miniIcon));
    open.append(icon, h('span', 'label', item.title));
    el.append(open);
  } else {
    el.classList.add('glass');
    Object.assign(el.dataset, { kind: item.kind, w: item.w, h: item.h });
    el.append(...renderWidget(item, ctx));
  }
  const del = h('button', 'del', '×');
  del.title = t('del');
  el.append(del);
  return el;
}

/* ---------- render ---------- */
const sortOpts = where => ({
  group: { name: 'home', put: where === 'dock' ? (to, from, el) => el.dataset.type === 'link' : true },
  animation: 200,
  disabled: !editing,
  filter: '.del',
  preventOnFilter: false,
  emptyInsertThreshold: 40,
  forceFallback: true, // mouse-event drag: consistent ghost, works for all inputs
  fallbackTolerance: 4,
  onStart: evt => { dragging = true; dragEl = evt.item; },
  // Hovering a dragged link over the centre of another page link/folder targets it for merging
  // instead of swapping places.
  onMove: evt => {
    const rel = evt.related;
    const mergeable = evt.dragged.dataset.type === 'link' && rel.closest('#pages') && rel.matches('.link, .folder');
    if (mergeable && overCentre(rel)) { setDropTarget(rel); return false; }
    setDropTarget(null);
    return true;
  },
  onEnd: evt => {
    dragging = false;
    dragEl = null;
    const target = dropTarget && overCentre(dropTarget) ? dropTarget.dataset.id : null;
    setDropTarget(null);
    setTimeout(() => {
      readDom();
      if (target) mergeInto(target, evt.item.dataset.id);
      normalizeFolders();
      save();
      render();
    });
  },
});

let dropTarget = null, dragEl = null;
const setDropTarget = el => {
  if (dropTarget === el) return;
  dropTarget?.classList.remove('drop-target');
  dropTarget = el;
  el?.classList.add('drop-target');
};
const overCentre = el => {
  const r = el.querySelector('.icon').getBoundingClientRect(), [x, y] = lastXY;
  return Math.abs(x - (r.left + r.width / 2)) < r.width * 0.35 && Math.abs(y - (r.top + r.height / 2)) < r.height * 0.35;
};

function mergeInto(targetId, dragId) {
  const drag = findItem(dragId);
  if (!drag || drag.type !== 'link' || targetId === dragId) return;
  state.pages = state.pages.map(p => p.filter(i => i.id !== dragId));
  state.dock = state.dock.filter(i => i.id !== dragId);
  const target = findItem(targetId);
  const page = state.pages.find(p => p.includes(target));
  if (!page) return state.pages[curPage()].push(drag); // target vanished: don't lose the link
  if (target.type === 'folder') target.items.push(drag);
  else page[page.indexOf(target)] = { id: uid(), type: 'folder', title: t('folder.default'), items: [target, drag] };
}

const readBox = (box, byId) => [...box.querySelectorAll(':scope > .item')].map(el => byId.get(el.dataset.id)).filter(Boolean);
function readDom() {
  const byId = new Map(allItems().map(i => [i.id, i]));
  state.pages = [...$pages.children].map(p => readBox(p, byId));
  state.dock = readBox($dockList, byId);
}

// Push items that overflow a page onto the next one (iPad-style).
// ponytail: runs on render only, not on window resize — a smaller window just clips until the next edit.
function reflow() {
  let moved = false;
  if ($pages.clientHeight < 100) return moved; // not laid out yet
  const pgs = [...$pages.children];
  for (let i = 0; i < pgs.length; i++) {
    while (pgs[i].scrollHeight > pgs[i].clientHeight + 1 && pgs[i].children.length > 1) {
      if (!pgs[i + 1]) $pages.append(pgs[i + 1] = h('section', 'page'));
      pgs[i + 1].prepend(pgs[i].lastElementChild);
      moved = true;
    }
  }
  return moved;
}

function render() {
  if (editing && state.pages.at(-1).length) state.pages.push([]); // spare page to drop into
  const left = $pages.scrollLeft;
  sortables.forEach(s => s.destroy());
  $pages.replaceChildren(...state.pages.map(p => {
    const pg = h('section', 'page');
    pg.append(...p.map(itemEl));
    return pg;
  }));
  $dockList.replaceChildren(...state.dock.map(itemEl));
  if (reflow()) { readDom(); save(); return render(); }
  sortables = [...$pages.children, $dockList].map(box => Sortable.create(box, sortOpts(box === $dockList ? 'dock' : 'page')));
  $pages.scrollLeft = left;
  renderDots();
  tick();
}

function syncFromDom() {
  readDom();
  save();
  render();
}

/* ---------- pages & dots ---------- */
const curPage = () => Math.round($pages.scrollLeft / $pages.clientWidth) || 0;
const goPage = i => {
  i = Math.max(0, Math.min(state.pages.length - 1, i));
  $pages.scrollTo({ left: i * $pages.clientWidth, behavior: 'smooth' });
};
function renderDots() {
  $dots.replaceChildren(...state.pages.map((_, i) => {
    const b = h('button');
    b.ariaLabel = t('page.n', { n: i + 1 });
    b.onclick = () => goPage(i);
    return b;
  }));
  markDot();
}
function markDot() {
  const c = curPage();
  [...$dots.children].forEach((b, i) => b.classList.toggle('on', i === c));
}
$pages.addEventListener('scroll', () => requestAnimationFrame(markDot), { passive: true });

// Vertical mouse wheel flips pages (horizontal touchpad swipe is native).
let wheelLock = false;
$pages.addEventListener('wheel', e => {
  if (e.target.closest('textarea, .todo-list') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  if (wheelLock || Math.abs(e.deltaY) < 8) return;
  wheelLock = true;
  setTimeout(() => (wheelLock = false), 450);
  goPage(curPage() + Math.sign(e.deltaY));
}, { passive: false });

// Dragging an item to the screen edge flips the page.
let flipAt = 0, dragging = false, lastXY = [0, 0];
document.addEventListener('pointermove', e => {
  if (!dragging) return;
  lastXY = [e.clientX, e.clientY];
  if (dragEl?.dataset.type === 'link') {
    const over = document.elementFromPoint(...lastXY)?.closest('#pages .link, #pages .folder');
    setDropTarget(over && over !== dragEl && overCentre(over) ? over : null);
  }
  if (!editing || $('#folderDlg').open) return; // no page flips while a folder is open
  const dir = e.clientX < 60 ? -1 : e.clientX > innerWidth - 60 ? 1 : 0;
  if (!dir || Date.now() - flipAt < 800) return;
  flipAt = Date.now();
  goPage(curPage() + dir);
});

/* ---------- edit mode ---------- */
function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  if (!on) {
    state.pages = state.pages.filter(p => p.length);
    if (!state.pages.length) state.pages.push([]);
    save();
  }
  render();
  if ($('#folderDlg').open) renderFolder();
  if (curPage() >= state.pages.length) goPage(state.pages.length - 1);
}
$('#editBtn').onclick = () => setEditing(true);
$('#doneBtn').onclick = () => setEditing(false);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && editing && !$('dialog[open]')) setEditing(false);
  if (e.key === 'Enter' && e.target.matches('.folder .open')) openFolder(e.target.parentElement.dataset.id);
});

// Long-press (500ms) on the home screen enters edit mode.
let pressTimer, pressXY, swallowClick = false;
document.addEventListener('pointerdown', e => {
  swallowClick = false;
  if (editing || e.button !== 0 || !e.target.closest('#pages, #dock, #folderGrid')) return;
  if (e.target.closest('input, textarea, button, .todo-list')) return;
  pressXY = [e.clientX, e.clientY];
  pressTimer = setTimeout(() => { swallowClick = true; setEditing(true); }, 500);
});
document.addEventListener('pointermove', e => {
  if (pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 8) clearTimeout(pressTimer);
});
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => clearTimeout(pressTimer));

document.addEventListener('click', e => {
  if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const del = e.target.closest('.del');
  if (del) { e.preventDefault(); removeItem(del.parentElement.dataset.id); return; }
  const folder = e.target.closest('.item.folder');
  if (folder) { openFolder(folder.dataset.id); return; }
  if (!editing) return;
  const link = e.target.closest('.item.link');
  if (link) { e.preventDefault(); openLinkDlg(findItem(link.dataset.id)); return; }
  if (e.target.matches('.page, #pages')) setEditing(false); // tap empty space = done
}, true);

function removeItem(id) {
  const it = findItem(id);
  if (!it) return;
  if (it.type === 'folder') {
    if (!confirm(t('confirm.folder', { name: it.title, n: it.items.length }))) return;
  } else if (((state.notes[id] || '').trim() || state.todos[id]?.length) && !confirm(t('confirm.widget'))) return;
  const keep = i => i.id !== id;
  state.pages = state.pages.map(p => p.filter(keep));
  state.dock = state.dock.filter(keep);
  for (const f of state.pages.flat()) if (f.type === 'folder') f.items = f.items.filter(keep);
  delete state.notes[id];
  delete state.todos[id];
  normalizeFolders();
  pruneIcons();
  save();
  render();
  if ($('#folderDlg').open) renderFolder();
}

/* ---------- folders ---------- */
let openFolderId = null, folderSortable = null;
const $folderDlg = $('#folderDlg'), $folderGrid = $('#folderGrid');

function openFolder(id) {
  openFolderId = id;
  renderFolder();
  if (!$folderDlg.open) $folderDlg.showModal();
}
function renderFolder() {
  const f = findItem(openFolderId);
  if (f?.type !== 'folder') return $folderDlg.close(); // dissolved or deleted
  $('#folderTitle').value = f.title;
  folderSortable?.destroy();
  $folderGrid.replaceChildren(...f.items.map(itemEl));
  folderSortable = Sortable.create($folderGrid, {
    animation: 200,
    disabled: !editing,
    filter: '.del',
    preventOnFilter: false,
    forceFallback: true,
    fallbackTolerance: 4,
    onStart: () => (dragging = true),
    onEnd: evt => { dragging = false; setTimeout(() => folderDrop(evt.item.dataset.id)); },
  });
}
// Reorder inside the folder, or — dropped outside the panel — move the link out to the current page.
function folderDrop(id) {
  const f = findItem(openFolderId);
  f.items = readBox($folderGrid, new Map(f.items.map(i => [i.id, i])));
  const r = $('.folder-panel').getBoundingClientRect(), [x, y] = lastXY;
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
    const it = f.items.find(i => i.id === id);
    f.items = f.items.filter(i => i !== it);
    state.pages[curPage()].push(it);
  }
  normalizeFolders();
  save();
  render();
  renderFolder();
}
$('#folderTitle').onchange = e => {
  const f = findItem(openFolderId);
  if (!f) return;
  f.title = e.target.value.trim().slice(0, 40) || t('folder.default');
  save();
  render();
};
$folderDlg.addEventListener('click', e => { if (e.target === $folderDlg) $folderDlg.close(); }); // backdrop
$folderDlg.addEventListener('close', () => {
  folderSortable?.destroy();
  folderSortable = openFolderId = null;
});

/* ---------- dialogs ---------- */
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('dialog').close();

// Link dialog. dlgIcon: 'keep' (existing icon) | 'none' (back to favicon) | {blob, url} (just uploaded).
let editingLink = null, dlgIcon = 'keep';
const $linkForm = $('#linkForm');
const setDlgIcon = v => {
  if (dlgIcon.url) URL.revokeObjectURL(dlgIcon.url);
  dlgIcon = v;
};
const dlgBg = f => (f.bg.value === 'auto' ? undefined : f.bg.value === 'custom' ? f.bgColor.value : f.bg.value);
function dlgIconSrc(f) {
  if (dlgIcon.blob) return dlgIcon.url;
  if (f.iconUrl.value.trim()) return normalizeUrl(f.iconUrl.value) || undefined;
  if (dlgIcon === 'keep' && editingLink?.icon === 'upload') return iconUrls.get(editingLink.id);
  return undefined;
}
function updatePreview() {
  const f = $linkForm, box = $('#iconPreview'), url = normalizeUrl(f.url.value);
  f.bgColor.hidden = f.bg.value !== 'custom';
  if (!url) { box.className = 'icon'; box.style.background = ''; box.replaceChildren(); return; }
  const link = { id: editingLink?.id, url, title: f.title.value.trim() || hostOf(url), bg: dlgBg(f) };
  paintIcon(box, link, dlgIconSrc(f) ?? null);
}

function openLinkDlg(item, place = 'page') {
  const f = $linkForm;
  editingLink = item || null;
  setDlgIcon('keep');
  f.reset();
  $('#linkErr').textContent = '';
  $('#linkTitle').textContent = t(item ? 'link.edit' : 'link.add');
  $('#placeRow').hidden = !!item;
  f.place.value = place;
  if (item) {
    f.url.value = item.url;
    f.title.value = item.title;
    f.bg.value = !item.bg ? 'auto' : item.bg.startsWith('#') ? 'custom' : item.bg;
    if (item.bg?.startsWith('#')) f.bgColor.value = item.bg;
    if (item.icon && item.icon !== 'upload') f.iconUrl.value = item.icon;
  }
  updatePreview();
  $('#linkDlg').showModal();
}
$linkForm.addEventListener('input', e => { if (e.target.type !== 'file') updatePreview(); });

// Uploaded icons are shrunk to 128px PNG so IndexedDB stays small.
function toIconBlob(file) {
  return new Promise((res, rej) => {
    const src = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const n = 128, c = document.createElement('canvas'), k = Math.min(n / img.naturalWidth, n / img.naturalHeight, 1) || 1;
      const w = img.naturalWidth * k || n, hh = img.naturalHeight * k || n;
      c.width = c.height = n;
      c.getContext('2d').drawImage(img, (n - w) / 2, (n - hh) / 2, w, hh);
      URL.revokeObjectURL(src);
      c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(src); rej(new Error('not an image')); };
    img.src = src;
  });
}
$('#iconFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await toIconBlob(file);
    setDlgIcon({ blob, url: URL.createObjectURL(blob) });
    $linkForm.iconUrl.value = '';
    $('#linkErr').textContent = '';
  } catch {
    $('#linkErr').textContent = t('err.notImage');
  }
  updatePreview();
};
$('#iconClear').onclick = () => {
  setDlgIcon('none');
  $linkForm.iconUrl.value = '';
  updatePreview();
};
$('#linkDlg').addEventListener('close', () => setDlgIcon('keep'));

$linkForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, url = normalizeUrl(f.url.value), err = $('#linkErr');
  if (!url) { err.textContent = t('err.url'); return; }
  const typed = f.iconUrl.value.trim(), iconUrl = typed ? normalizeUrl(typed) : null;
  if (typed && !iconUrl) { err.textContent = t('err.iconUrl'); return; }

  const link = editingLink || { id: uid(), type: 'link' };
  const bg = dlgBg(f);
  Object.assign(link, { url, title: f.title.value.trim() || hostOf(url) });
  if (bg) link.bg = bg;
  else delete link.bg;
  if (dlgIcon.blob) {
    await setIcon(link.id, dlgIcon.blob);
    link.icon = 'upload';
  } else if (iconUrl) {
    link.icon = iconUrl;
  } else if (dlgIcon === 'none' || link.icon !== 'upload') {
    delete link.icon;
  }
  if (!editingLink) (f.place.value === 'dock' ? state.dock : state.pages[curPage()]).push(link);
  pruneIcons();
  save();
  render();
  if ($folderDlg.open) renderFolder();
  $('#linkDlg').close();
});

// Drop uploaded icons no link uses any more (deleted links, switched back to favicon, imports).
function pruneIcons() {
  const used = new Set(allItems().filter(i => i.icon === 'upload').map(i => i.id));
  for (const id of iconUrls.keys()) if (!used.has(id)) setIcon(id, null);
}
$('#dockAdd').onclick = () => openLinkDlg(null, 'dock');

$('#addBtn').onclick = () => $('#addDlg').showModal();
$('#addDlg').addEventListener('click', e => {
  const k = e.target.closest('[data-add]')?.dataset.add;
  if (!k) return;
  $('#addDlg').close();
  if (k === 'link') return openLinkDlg(null, 'page');
  const [kind, w] = k.split('-');
  const [dw, dh] = WIDGET_SIZES[kind].find(s => s[0] === +w) || WIDGET_SIZES[kind][0];
  state.pages[curPage()].push({ id: uid(), type: 'widget', kind, w: dw, h: dh });
  save();
  render();
});

/* ---------- settings ---------- */
const $set = $('#settings');
const openSettings = on => { $set.classList.toggle('open', on); $set.inert = !on; };
$('#setBtn').onclick = () => openSettings(!$set.classList.contains('open'));
$('#setClose').onclick = () => openSettings(false);

const msg = (text, bad = false) => {
  const m = $('#setMsg');
  m.textContent = text;
  m.classList.toggle('bad', bad);
};

function syncSettingsUI() {
  const s = state.settings;
  $('#dimRange').value = s.dim;
  $('#blurRange').value = s.blur;
  $('#searchOn').checked = s.search;
  $('#engineSel').value = s.engine;
  $('#langSel').value = s.lang;
}
const setSetting = (k, v) => { state.settings[k] = v; applySettings(); save(); };
$('#dimRange').oninput = e => setSetting('dim', +e.target.value);
$('#blurRange').oninput = e => setSetting('blur', +e.target.value);
$('#searchOn').onchange = e => setSetting('search', e.target.checked);
$('#engineSel').onchange = e => setSetting('engine', e.target.value);
$('#langSel').onchange = e => {
  setSetting('lang', e.target.value); // applySettings → setLang + translateDom
  render(); // widgets & dots build their text in JS
  if ($folderDlg.open) renderFolder();
  msg('');
};

$('#wallFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) return msg(t('err.notImage'), true);
  await putWall(f);
  await applyWall();
  msg(t('msg.wallChanged'));
};
$('#wallUrlForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url = normalizeUrl(e.target.url.value);
  if (!url || !(await loads(url))) return msg(t('msg.wallUrlFail'), true);
  await putWall({ url });
  await applyWall();
  e.target.reset();
  msg(t('msg.wallChanged'));
});
$('#wallReset').onclick = async () => { await putWall(null); await applyWall(); msg(t('msg.wallReset')); };
$('#wallDaily').onclick = async () => {
  await putWall({ daily: 'bing' });
  await applyWall();
  msg(t($('#wall').style.backgroundImage ? 'msg.wallDaily' : 'msg.bingFail'), !$('#wall').style.backgroundImage);
};

$('#exportBtn').onclick = async () => {
  const wall = await getWall().catch(() => null);
  const data = { ...state, wallpaperUrl: wall instanceof Blob ? undefined : wall?.url, wallpaperDaily: !!wall?.daily || undefined };
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `mono-newtab-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  msg(t('msg.exported'));
};
$('#importFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 5e6) return msg(t('msg.tooBig'), true);
  let next, wall;
  try {
    const raw = JSON.parse(await f.text());
    next = validateState(raw);
    const wallUrl = normalizeUrl(raw.wallpaperUrl);
    wall = raw.wallpaperDaily === true ? { daily: 'bing' } : wallUrl ? { url: wallUrl } : null;
  } catch (err) {
    return msg(t('msg.importFail', { reason: t(err instanceof SyntaxError ? 'import.notJson' : 'import.badFormat') }), true);
  }
  if (!confirm(t('confirm.import'))) return;
  replaceState(next);
  await save();
  if (wall) { await putWall(wall); await applyWall(); }
  applySettings();
  syncSettingsUI();
  render();
  msg(t('msg.imported'));
};

/* ---------- other tabs ---------- */
// Each tab holds its own copy; reload when this tab becomes visible so it never saves stale data.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || editing) return;
  applyWall(); // picks up a new daily image after midnight
  replaceState(await loadState());
  await loadIcons(); // another tab may have uploaded icons
  applySettings();
  syncSettingsUI();
  render();
  if ($folderDlg.open) renderFolder();
});

/* ---------- boot ---------- */
await loadIcons();
applySettings();
syncSettingsUI();
render();
setInterval(tick, 1000);
