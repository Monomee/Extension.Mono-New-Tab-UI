// App switcher: open tabs as cards, most recent first. Click = switch, swipe up / × / Delete = close tab.
// Underneath: recently closed tabs to restore.
import { t } from './i18n.js';
import { h } from './widgets.js';

// Average colour of the opaque, not-near-white/black pixels of an icon → [r, g, b], or null.
export function avgColor(rgba) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 765;
    if (l > 0.92 || l < 0.08) continue;
    r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n].map(Math.round) : null;
}

const GROUP = { grey: '#8e8e93', blue: '#0a84ff', red: '#ff453a', yellow: '#ffd60a', green: '#30d158', pink: '#ff375f', purple: '#bf5af2', cyan: '#64d2ff', orange: '#ff9f0a' };
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; } };
const colors = new Map(); // favicon src → 'r g b' | ''

function tint(el, img) {
  const paint = c => c && el.style.setProperty('--c', c);
  if (colors.has(img.src)) return paint(colors.get(img.src));
  img.addEventListener('load', () => {
    let c = '';
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 16, 16);
      c = avgColor(g.getImageData(0, 0, 16, 16).data)?.join(' ') || '';
    } catch { /* tainted */ }
    colors.set(img.src, c);
    paint(c);
  }, { once: true });
}

// inline: the cards sit directly in the page (popup) instead of a full-screen dialog.
export function initSwitcher({ tabs, refresh, switchTo, leave, favicon, inline = false }) {
  const dlg = inline ? null : document.querySelector('#switcher'), $cards = document.querySelector('#cards');
  const $closed = document.querySelector('#closedList');

  function card(tb, group) {
    const el = h('div', 'card');
    el.tabIndex = 0;
    el.dataset.id = tb.id;
    el.title = tb.title || '';
    const head = h('div', 'card-head'), ico = new Image(), big = new Image();
    ico.alt = big.alt = '';
    ico.src = big.src = favicon(tb.url || '');
    const x = h('button', 'card-x', '×');
    x.title = x.ariaLabel = t('sw.closeTab');
    head.append(ico, h('span', null, tb.title || hostOf(tb.url)), x);
    const body = h('div', 'card-body');
    body.append(big, h('span', 'card-host', hostOf(tb.url)));
    if (group) {
      const chip = h('span', 'card-group', group.title || t('sw.group'));
      chip.style.background = GROUP[group.color] || GROUP.grey;
      body.append(chip);
    }
    el.append(head, body);
    tint(el, big);
    return el;
  }

  function chip(entry) {
    const tab = entry.tab, b = h('button', 'closed');
    const img = new Image();
    img.alt = '';
    img.src = tab ? favicon(tab.url) : 'icons/icon32.png';
    b.append(img, h('span', null, tab ? tab.title || hostOf(tab.url) : t('sw.window', { n: entry.window.tabs.length })));
    b.title = tab?.url || '';
    b.onclick = async () => {
      await chrome.sessions.restore((tab || entry.window).sessionId);
      dlg?.close();
      leave();
    };
    return b;
  }

  async function render() {
    const list = [...tabs()].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const groups = new Map(((await chrome.tabGroups?.query({}).catch(() => [])) || []).map(g => [g.id, g]));
    const focused = document.activeElement?.closest?.('.card')?.dataset.id;
    $cards.replaceChildren(...list.map(tb => card(tb, groups.get(tb.groupId))));
    if (!list.length) $cards.append(h('p', 'sw-empty', t('sw.empty')));
    $cards.querySelector(`[data-id="${focused}"]`)?.focus();
    const self = chrome.runtime.getURL('');
    const recent = ((await chrome.sessions?.getRecentlyClosed({ maxResults: 12 }).catch(() => [])) || [])
      .filter(e => e.window || (e.tab && !e.tab.url?.startsWith(self) && !e.tab.url?.startsWith('chrome://newtab')))
      .slice(0, 8);
    $closed.replaceChildren(...recent.map(chip));
    $closed.parentElement.hidden = !recent.length;
  }

  async function open() {
    await refresh();
    await render();
    if (dlg && !dlg.open) dlg.showModal();
    $cards.querySelector('.card')?.focus();
  }

  const closeTab = el => {
    el.classList.add('gone');
    chrome.tabs.remove(+el.dataset.id).catch(() => {});
  };
  const pick = el => { dlg?.close(); switchTo(tabs().find(tb => tb.id === +el.dataset.id)); };

  // Swipe a card up to close its tab; a short press is a click.
  let drag = null;
  $cards.addEventListener('pointerdown', e => {
    const el = e.target.closest('.card');
    if (!el || e.target.closest('.card-x') || e.button !== 0) return;
    drag = { el, y: e.clientY, dy: 0 };
    el.setPointerCapture(e.pointerId);
  });
  $cards.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.dy = Math.min(0, e.clientY - drag.y);
    drag.el.style.transform = `translateY(${drag.dy}px)`;
    drag.el.style.opacity = 1 + drag.dy / 400;
  });
  const end = () => {
    if (!drag) return;
    const { el, dy } = drag;
    drag = null;
    el.style.transform = el.style.opacity = '';
    if (dy < -120) closeTab(el);
    else if (dy > -6) pick(el);
  };
  $cards.addEventListener('pointerup', end);
  $cards.addEventListener('pointercancel', () => { if (drag) drag.el.style.transform = drag.el.style.opacity = ''; drag = null; });
  $cards.addEventListener('click', e => { const x = e.target.closest('.card-x'); if (x) closeTab(x.closest('.card')); });

  (dlg || document).addEventListener('keydown', e => {
    const el = e.target.closest?.('.card');
    if (!el) return;
    if (e.key === 'Enter') pick(el);
    else if (e.key === 'Delete' || e.key === 'Backspace') closeTab(el);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      (e.key === 'ArrowRight' ? el.nextElementSibling : el.previousElementSibling)?.focus();
      e.preventDefault();
    }
  });
  if (inline) return { open, update: render };
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.matches('.sw-wrap')) dlg.close(); }); // backdrop
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'ArrowUp' && !document.querySelector('dialog[open]')) { e.preventDefault(); open(); }
  });
  document.querySelector('#switchBtn').onclick = open;

  return { open, update: () => dlg.open && render() };
}
