// Open browser tabs as "running apps". Pure helpers; callers pass chrome.tabs.query() results.

// Side panel feature switch. Hidden for now: Chrome won't make the panel narrower than ~320px,
// so icons-only isn't compact enough. true = setting, popup button and panel come back.
export const SIDE_PANEL = false;

export const faviconUrl = u => `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(u)}&size=64`;
// Every shortcut in the saved state (pages, folders, dock), each URL once.
export function allLinks(state) {
  const seen = new Set();
  return [...state.dock, ...state.pages.flat()].flatMap(i => i.items || [i])
    .filter(i => i.type === 'link' && !seen.has(i.url) && seen.add(i.url));
}

// host (no www.) + path (no trailing slash): "github.com/foo"
const keyOf = url => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  } catch { return ''; }
};

// A tab belongs to a link when it's on the same site and under the link's path:
// google.com/ ← google.com/search?q=x, github.com/foo ← github.com/foo/bar, but not github.com/foobar.
export function tabMatches(tabUrl, linkUrl) {
  const t = keyOf(tabUrl), l = keyOf(linkUrl);
  return !!l && (t === l || t.startsWith(l + '/'));
}

export const tabsFor = (tabs, linkUrl) => tabs.filter(t => t.url && tabMatches(t.url, linkUrl));

// Most recently used matching tab, or null.
export const pickTab = (tabs, linkUrl) =>
  tabsFor(tabs, linkUrl).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
