// Popup (toolbar button or Ctrl+Shift+Space on any tab): spotlight + app switcher for the tab you're on.
import { loadState, ENGINES } from './state.js';
import { setLang, translateDom } from './i18n.js';
import { faviconUrl, allLinks } from './tabs.js';
import { initSpotlight } from './spotlight.js';
import { initSwitcher } from './switcher.js';

const $ = s => document.querySelector(s);
const close = () => window.close();
const state = await loadState();
const s = state.settings;
setLang(s.lang);
translateDom();
document.documentElement.dataset.theme = s.theme;
$('#search').action = ENGINES[s.engine];

// The page the popup was opened over isn't an "other app": leave it out.
const [here] = await chrome.tabs.query({ active: true, currentWindow: true });
let tabs = [];
const refresh = async () => { tabs = (await chrome.tabs.query({})).filter(tb => tb.id !== here?.id); };

async function switchTo(tab) {
  if (!tab) return;
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  close();
}
const openUrl = url => { chrome.tabs.create({ url, index: here ? here.index + 1 : undefined }); close(); };

await refresh();
const switcher = initSwitcher({ tabs: () => tabs, refresh, switchTo, leave: close, favicon: faviconUrl, inline: true });
initSpotlight({
  links: () => allLinks(state), tabs: () => tabs, switchTo, openUrl, favicon: faviconUrl,
  engineName: () => ({ google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' })[s.engine],
});
switcher.update();
$('#search').q.focus();

let t;
const changed = () => { clearTimeout(t); t = setTimeout(() => refresh().then(switcher.update), 150); };
for (const ev of ['onCreated', 'onRemoved', 'onActivated']) chrome.tabs[ev].addListener(changed);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.title) changed(); });

// ↓ from an empty search box jumps to the cards (←/→ move, Enter switch, Delete close).
$('#search').q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && !e.target.value) { e.preventDefault(); $('#cards .card')?.focus(); }
});

// Side panel dock, when turned on in settings.
if (s.sidePanel && chrome.sidePanel) {
  $('#panelBtn').hidden = false;
  $('#panelBtn').onclick = () => { chrome.sidePanel.open({ windowId: here.windowId }); close(); };
}
