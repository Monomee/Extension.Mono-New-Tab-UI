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
