// Side panel dock: every shortcut (dot = open in a tab), the open tabs, and spotlight search.
// Stays open beside pages, so everything updates live.
import { loadState, ENGINES } from './state.js';
import { t, setLang, translateDom } from './i18n.js';
import { faviconUrl, allLinks, tabsFor, pickTab } from './tabs.js';
import { initSpotlight } from './spotlight.js';
import { h } from './widgets.js';

const $ = s => document.querySelector(s);
let state, tabs = [];

async function load() {
  state = await loadState();
  const s = state.settings;
  setLang(s.lang);
  translateDom();
  document.documentElement.dataset.theme = s.theme;
  $('#search').action = ENGINES[s.engine];
}

async function switchTo(tab) {
  if (!tab) return;
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}
const openUrl = url => chrome.tabs.create({ url });

const icon = url => {
  const box = h('span', 'icon'), img = new Image();
  img.alt = '';
  img.src = faviconUrl(url);
  box.append(img);
  return box;
};

function draw() {
  $('#pApps').replaceChildren(...allLinks(state).map(l => {
    const n = tabsFor(tabs, l.url).length, b = h('button', 'p-app' + (n ? ' running' : ''));
    b.title = l.title;
    b.append(icon(l.url), h('span', 'label', l.title));
    b.onclick = () => {
      const tab = state.settings.switchTab && pickTab(tabs, l.url);
      tab ? switchTo(tab) : openUrl(l.url);
    };
    return b;
  }));
  $('#pCount').textContent = tabs.length;
  $('#pTabs').replaceChildren(...tabs.map(tb => {
    const li = h('li', tb.active ? 'on' : ''), img = new Image(), x = h('button', 'card-x', '×');
    img.alt = '';
    img.src = faviconUrl(tb.url || '');
    x.title = x.ariaLabel = t('sw.closeTab');
    x.onclick = e => { e.stopPropagation(); chrome.tabs.remove(tb.id); };
    li.title = tb.url || '';
    li.append(img, h('span', null, tb.title || tb.url), x);
    li.onclick = () => switchTo(tb);
    return li;
  }));
}

// Tabs of this window first (strip order), then other windows.
async function refresh() {
  const win = (await chrome.windows.getCurrent()).id;
  tabs = (await chrome.tabs.query({})).sort((a, b) => (b.windowId === win) - (a.windowId === win) || a.windowId - b.windowId || a.index - b.index);
  draw();
}

await load();
await refresh();
initSpotlight({
  links: () => allLinks(state), tabs: () => tabs, switchTo, openUrl, favicon: faviconUrl,
  engineName: () => ({ google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' })[state.settings.engine],
});

let timer;
const changed = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
for (const ev of ['onCreated', 'onRemoved', 'onActivated', 'onMoved', 'onAttached']) chrome.tabs[ev].addListener(changed);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.title || info.favIconUrl) changed(); });
chrome.storage.onChanged.addListener(async c => { if (c.state) { await load(); draw(); } }); // shortcuts / settings edited elsewhere
