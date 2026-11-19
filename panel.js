// Side panel: open tabs as icons only (this window first, a thin line between windows).
// Click = switch, middle-click = close, hover = title. Updates live.
import { loadState } from './state.js';
import { faviconUrl } from './tabs.js';
import { h } from './widgets.js';

const $tabs = document.querySelector('#pTabs');
const theme = async () => { document.documentElement.dataset.theme = (await loadState()).settings.theme; };

async function draw() {
  const win = (await chrome.windows.getCurrent()).id;
  const tabs = (await chrome.tabs.query({}))
    .sort((a, b) => (b.windowId === win) - (a.windowId === win) || a.windowId - b.windowId || a.index - b.index);
  $tabs.replaceChildren(...tabs.flatMap((tb, i) => {
    const b = h('button', 'p-tab' + (tb.active && tb.windowId === win ? ' on' : '')), img = new Image();
    b.role = 'listitem';
    b.title = b.ariaLabel = tb.title || tb.url || '';
    img.alt = '';
    img.src = faviconUrl(tb.url || '');
    b.append(img);
    b.onclick = async () => {
      await chrome.tabs.update(tb.id, { active: true });
      chrome.windows.update(tb.windowId, { focused: true });
    };
    b.onauxclick = e => { if (e.button === 1) chrome.tabs.remove(tb.id); };
    return i && tb.windowId !== tabs[i - 1].windowId ? [h('hr'), b] : [b];
  }));
}

let timer;
const changed = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };
for (const ev of ['onCreated', 'onRemoved', 'onActivated', 'onMoved', 'onAttached', 'onDetached']) chrome.tabs[ev].addListener(changed);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.title || info.favIconUrl) changed(); });
chrome.windows.onFocusChanged.addListener(changed);
chrome.storage.onChanged.addListener(c => { if (c.state) theme(); });
theme();
draw();
