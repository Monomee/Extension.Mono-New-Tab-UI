/* global Sortable */
import { loadState, saveState, validateState, normalizeUrl, uid, ENGINES, WIDGET_SIZES } from './state.js';
import { renderWidget, tick } from './widgets.js';

const $ = s => document.querySelector(s);
const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const $pages = $('#pages'), $dockList = $('#dockList'), $dots = $('#dots');

/* ---------- wallpaper (IndexedDB: Blob | {url}) ---------- */
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open('mono', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('wallpaper');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const wallDb = async (mode, op) => {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('wallpaper', mode);
    const req = op(tx.objectStore('wallpaper'));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
};
const getWall = () => wallDb('readonly', s => s.get('current'));
const putWall = v => wallDb('readwrite', s => (v ? s.put(v, 'current') : s.delete('current')));
const loads = src => new Promise(r => {
  const i = new Image();
  i.onload = () => r(true);
  i.onerror = () => r(false);
  i.src = src;
});

let wallSrc;
async function applyWall() {
  const v = await getWall().catch(() => null);
  if (wallSrc?.startsWith('blob:')) URL.revokeObjectURL(wallSrc);
  wallSrc = v instanceof Blob ? URL.createObjectURL(v) : v?.url;
  const ok = wallSrc ? await loads(wallSrc) : false;
  $('#wall').style.backgroundImage = ok ? `url("${wallSrc}")` : ''; // fail → CSS gradient
}
applyWall(); // start before state loads to avoid a flash

/* ---------- state ---------- */
const state = await loadState();
const save = () => saveState(state);
const ctx = { state, save };
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
function miniIcon(link) {
  const box = h('span', 'mini'), img = new Image();
  img.alt = '';
  img.onerror = () => letterIcon(box, link, 'mini letter');
  img.src = faviconUrl(link.url);
  box.append(img);
  return box;
}

function itemEl(item) {
  const el = h('div', 'item ' + item.type);
  el.dataset.id = item.id;
  el.dataset.type = item.type;
  if (item.type === 'link') {
    const a = h('a');
    a.href = item.url;
    a.title = item.title;
    a.draggable = false;
    const icon = h('span', 'icon'), img = new Image();
    img.alt = '';
    img.onerror = () => letterIcon(icon, item);
    img.src = faviconUrl(item.url);
    icon.append(img);
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
  del.title = 'Xóa';
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
  else page[page.indexOf(target)] = { id: uid(), type: 'folder', title: 'Thư mục', items: [target, drag] };
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
    b.ariaLabel = `Trang ${i + 1}`;
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
    if (!confirm(`Xóa thư mục "${it.title}" cùng ${it.items.length} lối tắt bên trong?`)) return;
  } else if (((state.notes[id] || '').trim() || state.todos[id]?.length) && !confirm('Widget này vẫn còn nội dung. Xóa luôn?')) return;
  const keep = i => i.id !== id;
  state.pages = state.pages.map(p => p.filter(keep));
  state.dock = state.dock.filter(keep);
  for (const f of state.pages.flat()) if (f.type === 'folder') f.items = f.items.filter(keep);
  delete state.notes[id];
  delete state.todos[id];
  normalizeFolders();
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
  f.title = e.target.value.trim().slice(0, 40) || 'Thư mục';
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

let editingLink = null;
function openLinkDlg(item, place = 'page') {
  const f = $('#linkForm');
  editingLink = item || null;
  f.reset();
  $('#linkErr').textContent = '';
  $('#linkTitle').textContent = item ? 'Sửa lối tắt' : 'Thêm lối tắt';
  $('#placeRow').hidden = !!item;
  f.place.value = place;
  if (item) { f.url.value = item.url; f.title.value = item.title; }
  $('#linkDlg').showModal();
}
$('#linkForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, url = normalizeUrl(f.url.value);
  if (!url) { $('#linkErr').textContent = 'Địa chỉ không hợp lệ (chỉ hỗ trợ http/https).'; return; }
  const title = f.title.value.trim() || new URL(url).hostname.replace(/^www\./, '');
  if (editingLink) Object.assign(editingLink, { url, title });
  else (f.place.value === 'dock' ? state.dock : state.pages[curPage()]).push({ id: uid(), type: 'link', url, title });
  save();
  render();
  if ($folderDlg.open) renderFolder();
  $('#linkDlg').close();
});
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
}
const setSetting = (k, v) => { state.settings[k] = v; applySettings(); save(); };
$('#dimRange').oninput = e => setSetting('dim', +e.target.value);
$('#blurRange').oninput = e => setSetting('blur', +e.target.value);
$('#searchOn').onchange = e => setSetting('search', e.target.checked);
$('#engineSel').onchange = e => setSetting('engine', e.target.value);

$('#wallFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) return msg('File này không phải ảnh.', true);
  await putWall(f);
  await applyWall();
  msg('Đã đổi ảnh nền.');
};
$('#wallUrlForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url = normalizeUrl(e.target.url.value);
  if (!url || !(await loads(url))) return msg('Không tải được ảnh từ link này.', true);
  await putWall({ url });
  await applyWall();
  e.target.reset();
  msg('Đã đổi ảnh nền.');
});
$('#wallReset').onclick = async () => { await putWall(null); await applyWall(); msg('Đã về nền mặc định.'); };

$('#exportBtn').onclick = async () => {
  const wall = await getWall().catch(() => null);
  const data = { ...state, wallpaperUrl: wall instanceof Blob ? undefined : wall?.url };
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `mono-newtab-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  msg('Đã xuất file sao lưu.');
};
$('#importFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 5e6) return msg('File quá lớn (tối đa 5MB).', true);
  let next, wallUrl;
  try {
    const raw = JSON.parse(await f.text());
    next = validateState(raw);
    wallUrl = normalizeUrl(raw.wallpaperUrl);
  } catch (err) {
    return msg('Không nhập được: ' + (err instanceof SyntaxError ? 'file không phải JSON hợp lệ.' : err.message), true);
  }
  if (!confirm('Thay toàn bộ màn hình hiện tại bằng dữ liệu trong file?')) return;
  replaceState(next);
  await save();
  if (wallUrl) { await putWall({ url: wallUrl }); await applyWall(); }
  applySettings();
  syncSettingsUI();
  render();
  msg('Đã khôi phục từ file sao lưu.');
};

/* ---------- other tabs ---------- */
// Each tab holds its own copy; reload when this tab becomes visible so it never saves stale data.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || editing) return;
  replaceState(await loadState());
  applySettings();
  syncSettingsUI();
  render();
  if ($folderDlg.open) renderFolder();
});

/* ---------- boot ---------- */
applySettings();
syncSettingsUI();
render();
setInterval(tick, 1000);
