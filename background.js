// Service worker: address-bar keyword ("m" + space) and the side panel on/off switch.
import { loadState, ENGINES } from './state.js';
import { t, setLang } from './i18n.js';
import { allLinks, SIDE_PANEL } from './tabs.js';
import { rank, bestAction, omniText } from './spotlight.js';

/* ---------- side panel: follows settings.sidePanel ---------- */
const applyPanel = async () => {
  const { settings } = await loadState();
  await chrome.sidePanel?.setOptions({ enabled: SIDE_PANEL && settings.sidePanel }).catch(() => {});
};
applyPanel();
chrome.storage.onChanged.addListener(c => { if (c.state) applyPanel(); });

/* ---------- Ctrl+Shift+Space: the new tab's switcher, over any page ---------- */
// Runs inside the page (activeTab grant from the shortcut). Toggles a full-page iframe of overlay.html;
// blur + dim live on the iframe element itself so they apply to the page behind it.
function toggleOverlay(src, scheme) {
  const old = document.getElementById('mono-overlay');
  if (old) return old.remove();
  const f = document.createElement('iframe');
  f.id = 'mono-overlay';
  f.src = src;
  // color-scheme must match the overlay's, or Chrome paints the iframe opaque.
  f.style.cssText = `all: initial; position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 2147483647;
    border: 0; display: block; color-scheme: ${scheme}; background: rgba(0, 0, 0, .35);
    backdrop-filter: blur(26px) saturate(140%); -webkit-backdrop-filter: blur(26px) saturate(140%);`;
  const before = document.activeElement;
  const onMsg = e => {
    if (e.source !== f.contentWindow || e.data !== 'mono:close') return;
    f.remove();
    removeEventListener('message', onMsg);
    before?.focus?.({ preventScroll: true });
  };
  addEventListener('message', onMsg);
  f.onload = () => f.focus();
  (document.body || document.documentElement).append(f);
}

async function openSwitcher(tab) {
  if (!tab) return;
  // Our own new tab (tab.url reads chrome://newtab/): use its built-in switcher.
  if (/^chrome:\/\/newtab|^chrome-extension:/.test(tab.url || '')) {
    return chrome.runtime.sendMessage({ type: 'switcher', tabId: tab.id }).catch(() => {});
  }
  const { settings } = await loadState();
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: toggleOverlay,
      args: [chrome.runtime.getURL('overlay.html'), settings.theme === 'auto' ? 'light dark' : settings.theme],
    });
  } catch {
    chrome.action.openPopup?.()?.catch(() => {}); // chrome://, Web Store, PDF viewer…: popup instead
  }
}
chrome.commands.onCommand.addListener((cmd, tab) => { if (cmd === 'switcher') openSwitcher(tab); });

/* ---------- omnibox: m <text> → open tabs + shortcuts ---------- */
async function search(text) {
  const state = await loadState();
  setLang(state.settings.lang);
  const tabs = (await chrome.tabs.query({})).filter(tb => tb.url);
  const rows = rank([
    ...tabs.map(tab => ({ kind: 'tab', title: tab.title, url: tab.url, tab })),
    ...allLinks(state).map(l => ({ kind: 'link', title: l.title, url: l.url })),
  ], text, 7);
  return { rows, settings: state.settings };
}
// Suggestion content is what Enter hands back; tabs carry their id.
const contentOf = r => (r.kind === 'tab' ? `tab:${r.tab.id} ${r.title}` : r.url);
const labelOf = r => t('spot.' + r.kind);

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const { rows } = await search(text);
  const first = bestAction(text, rows);
  chrome.omnibox.setDefaultSuggestion({
    description: first.kind === 'web' ? t('omni.web', { q: text.replace(/[&<>]/g, '') }) : omniText(first, labelOf(first)),
  });
  suggest(rows.filter(r => r !== first).map(r => ({ content: contentOf(r), description: omniText(r, labelOf(r)) })));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const { rows, settings } = await search(text.replace(/^tab:\d+ /, ''));
  const id = +text.match(/^tab:(\d+) /)?.[1];
  const r = id ? rows.find(x => x.tab?.id === id) || { kind: 'tab', tab: await chrome.tabs.get(id) }
    : rows.find(x => x.url === text) || bestAction(text, rows);
  if (r.kind === 'tab') {
    await chrome.tabs.update(r.tab.id, { active: true });
    return chrome.windows.update(r.tab.windowId, { focused: true });
  }
  const url = r.kind === 'web' ? `${ENGINES[settings.engine]}?q=${encodeURIComponent(r.title)}` : r.url;
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});
