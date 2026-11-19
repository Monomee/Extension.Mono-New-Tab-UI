import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeUrl, defaultState, validateState, needsDarkTile, placeItems, overlaps } from '../state.js';
import { describeWeather } from '../weather.js';
import { STRINGS, t, setLang } from '../i18n.js';
import { tabMatches, pickTab } from '../tabs.js';
import { score, rank, typedUrl } from '../spotlight.js';

assert.equal(normalizeUrl('youtube.com'), 'https://youtube.com/');
assert.equal(normalizeUrl('  http://a.vn/x '), 'http://a.vn/x');
assert.equal(normalizeUrl('javascript:alert(1)'), null);
assert.equal(normalizeUrl(''), null);
assert.equal(normalizeUrl('not a url'), null);

const d = defaultState();
assert.deepEqual(validateState(structuredClone(d)), d);

assert.throws(() => validateState({}));
assert.throws(() => validateState(null));
assert.throws(() => validateState({ ...d, pages: 'x' }));

const dirty = structuredClone(d);
dirty.hacker = 1;
dirty.pages[0].push({ id: 'bad', type: 'link', url: 'javascript:alert(1)', title: 'x' });
dirty.pages[0].push({ id: 'w', type: 'widget', kind: 'evil' });
dirty.dock.push({ id: 'w2', type: 'widget', kind: 'clock', w: 2, h: 2 });
dirty.notes.orphan = 'gone';
const clean = validateState(dirty);
assert.equal(clean.hacker, undefined);
assert.ok(!clean.pages[0].some(i => i.id === 'bad' || i.id === 'w'));
assert.ok(clean.dock.every(i => i.type === 'link'));
assert.equal(clean.notes.orphan, undefined);

// folders: pages only, links only inside, no nesting, empty dropped
const f = structuredClone(d);
f.pages[0].push({ id: 'f1', type: 'folder', title: 'Học', items: [
  { id: 'a', type: 'link', url: 'https://a.vn/', title: 'A' },
  { id: 'bad', type: 'link', url: 'javascript:alert(1)', title: 'x' },
  { id: 'nest', type: 'folder', title: 'n', items: [{ id: 'b', type: 'link', url: 'https://b.vn/', title: 'B' }] },
  { id: 'w', type: 'widget', kind: 'clock', w: 2, h: 2 },
] });
f.pages[0].push({ id: 'empty', type: 'folder', title: 'E', items: [] });
f.dock.push({ id: 'fd', type: 'folder', title: 'D', items: [{ id: 'c', type: 'link', url: 'https://c.vn/', title: 'C' }] });
const fc = validateState(f);
const folder = fc.pages[0].find(i => i.id === 'f1');
assert.deepEqual(folder.items.map(i => i.id), ['a']);
assert.equal(folder.title, 'Học');
assert.ok(!fc.pages[0].some(i => i.id === 'empty'));
assert.ok(!fc.dock.some(i => i.id === 'fd'));

// weather: widget sizes 2x2 / 4x2, city validated
const w = structuredClone(d);
w.pages[0].push({ id: 'wx', type: 'widget', kind: 'weather', w: 4, h: 2 });
w.settings.city = { name: 'Hà Nội', lat: 21.02, lon: 105.84 };
const wc = validateState(w);
assert.deepEqual(wc.pages[0].find(i => i.id === 'wx'), { id: 'wx', type: 'widget', kind: 'weather', w: 4, h: 2 });
assert.deepEqual(wc.settings.city, { name: 'Hà Nội', lat: 21.02, lon: 105.84 });
assert.equal(validateState({ ...d, settings: { ...d.settings, city: { name: 'x', lat: 999, lon: 0 } } }).settings.city, null);
assert.equal(validateState({ ...d, settings: { ...d.settings, city: 'Hanoi' } }).settings.city, null);
assert.equal(d.settings.city, null);

// link appearance: bg + custom icon
const ap = structuredClone(d);
ap.dock = [
  { id: 'l1', type: 'link', url: 'https://github.com/', title: 'GH', bg: 'DARK', icon: 'upload' },
  { id: 'l2', type: 'link', url: 'https://x.com/', title: 'X', bg: '#1A2B3C', icon: 'cdn.x.com/i.png' },
  { id: 'l3', type: 'link', url: 'https://y.com/', title: 'Y', bg: 'red; background:url(x)', icon: 'javascript:alert(1)' },
];
const apc = validateState(ap).dock;
assert.deepEqual(apc[0], { id: 'l1', type: 'link', url: 'https://github.com/', title: 'GH', bg: 'dark', icon: 'upload' });
assert.equal(apc[1].bg, '#1a2b3c');
assert.equal(apc[1].icon, 'https://cdn.x.com/i.png');
assert.ok(!('bg' in apc[2]) && !('icon' in apc[2]));

// auto tile contrast: light logo on transparent → needs dark tile
const px = (n, f) => { const a = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) a.set(f(i % n, Math.floor(i / n)), i * 4); return a; };
const N = 32, inLogo = (x, y) => x > 8 && x < 24 && y > 8 && y < 24;
assert.equal(needsDarkTile(px(N, () => [0, 0, 0, 0])), false);                                         // empty
assert.equal(needsDarkTile(px(N, (x, y) => inLogo(x, y) ? [240, 240, 240, 255] : [0, 0, 0, 0])), true); // white logo
assert.equal(needsDarkTile(px(N, (x, y) => inLogo(x, y) ? [20, 20, 20, 255] : [0, 0, 0, 0])), false);   // black logo
assert.equal(needsDarkTile(px(N, () => [255, 255, 255, 255])), false);                                  // full-bleed white square
assert.equal(needsDarkTile(px(N, (x, y) => inLogo(x, y) ? [230, 60, 40, 255] : [0, 0, 0, 0])), false);  // red logo

// i18n: both dictionaries have exactly the same keys and placeholders
const vk = Object.keys(STRINGS.vi).sort(), ek = Object.keys(STRINGS.en).sort();
assert.deepEqual(ek, vk);
const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
for (const k of vk) if (k !== 'date.month') assert.equal(ph(STRINGS.en[k]), ph(STRINGS.vi[k]), k);
const html = readFileSync(new URL('../newtab.html', import.meta.url), 'utf8');
const htmlKeys = [...html.matchAll(/data-i18n(?:-ph|-title|-aria)?="([^"]+)"/g)].map(m => m[1]);
assert.ok(htmlKeys.length > 50);
assert.deepEqual(htmlKeys.filter(k => !(k in STRINGS.vi)), []); // no typo'd keys in the page
assert.equal(t('page.n', { n: 3 }), 'Trang 3');
setLang('en');
assert.equal(t('page.n', { n: 3 }), 'Page 3');
assert.equal(describeWeather(63, true).text, 'Rain');
setLang('xx');
assert.equal(t('done'), 'Xong'); // unknown lang → vi
// settings.lang: kept if valid, missing → vi (existing installs stay Vietnamese)
assert.equal(validateState({ ...d, settings: { ...d.settings, lang: 'en' } }).settings.lang, 'en');
assert.equal(validateState({ ...d, settings: { ...d.settings, lang: 'fr' } }).settings.lang, 'vi');
const noLang = structuredClone(d); delete noLang.settings.lang;
assert.equal(validateState(noLang).settings.lang, 'vi');
assert.ok(['vi', 'en'].includes(d.settings.lang));

// free placement: saved cells kept, gaps allowed, collisions/legacy items take first free cell, overflow returned
const L = (id, x, y) => ({ id, type: 'link', url: 'https://a.vn/', title: id, x, y });
const W = (id, x, y) => ({ id, type: 'widget', kind: 'note', w: 4, h: 2, x, y });
const items = [L('a', 5, 3), W('n', 0, 0), L('b', 1, 1), L('old'), L('c', 5, 3)];
const over = placeItems(items, 6, 4);
assert.deepEqual(over, []);
const at = id => items.find(i => i.id === id);
assert.deepEqual([at('a').x, at('a').y], [5, 3]);   // gap kept
assert.deepEqual([at('n').x, at('n').y], [0, 0]);
assert.deepEqual([at('b').x, at('b').y], [4, 0]);   // was under the note → first free cell
assert.deepEqual([at('old').x, at('old').y], [5, 0]);
assert.deepEqual([at('c').x, at('c').y], [4, 1]);   // collided with a
assert.deepEqual(placeItems([L('x'), L('y'), L('z')], 2, 1).map(i => i.id), ['z']);
assert.deepEqual(overlaps(items, at('b'), 0, 1).map(i => i.id), ['n']);
const pos = structuredClone(d);
pos.pages[0][0].x = 3; pos.pages[0][0].y = 2; pos.pages[0][1].x = -1; pos.dock[0].x = 1; pos.dock[0].y = 1;
const pc = validateState(pos);
assert.deepEqual([pc.pages[0][0].x, pc.pages[0][0].y], [3, 2]);
assert.ok(!('x' in pc.pages[0][1]) && !('x' in pc.dock[0]));

// widget sizes: allowed ones kept, others fall back to the kind's default
const sz = (kind, w, hh) => validateState({ ...d, pages: [[{ id: 'z', type: 'widget', kind, w, h: hh }]] }).pages[0][0];
assert.deepEqual([sz('todo', 4, 4).w, sz('todo', 4, 4).h], [4, 4]);
assert.deepEqual([sz('date', 4, 4).w, sz('date', 4, 4).h], [4, 4]);
assert.deepEqual([sz('date', 4, 2).w, sz('date', 4, 2).h], [2, 2]);
assert.deepEqual([sz('clock', 4, 4).w, sz('clock', 4, 4).h], [2, 2]);

// weather codes
assert.deepEqual(describeWeather(0, true), { icon: '☀️', text: 'Trời quang' });
assert.equal(describeWeather(0, false).icon, '🌙');
assert.equal(describeWeather(63, true).text, 'Mưa');
assert.equal(describeWeather(12345, true).text, 'Không rõ');

// manifest strings come from _locales; every locale has the same keys
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const msgs = l => JSON.parse(readFileSync(new URL(`../_locales/${l}/messages.json`, import.meta.url), 'utf8'));
for (const l of ['en', 'vi']) for (const k of ['name', 'description']) assert.ok(msgs(l)[k]?.message, `${l}.${k}`);
assert.equal(manifest.name, '__MSG_name__');
assert.ok(msgs(manifest.default_locale));

// running apps: same site + under the link's path; most recently used wins
assert.ok(tabMatches('https://www.google.com/search?q=x', 'https://google.com/'));
assert.ok(tabMatches('https://github.com/foo/bar', 'https://github.com/foo'));
assert.ok(tabMatches('https://github.com/foo/', 'https://github.com/foo'));
assert.ok(!tabMatches('https://github.com/foobar', 'https://github.com/foo'));
assert.ok(!tabMatches('https://mail.google.com/', 'https://www.google.com/'));
assert.ok(!tabMatches('chrome://newtab/', 'https://google.com/'));
const tabs = [{ id: 1, url: 'https://a.vn/x', lastAccessed: 5 }, { id: 2, url: 'https://a.vn/', lastAccessed: 9 }, { id: 3, url: 'https://b.vn/' }];
assert.equal(pickTab(tabs, 'https://a.vn').id, 2);
assert.equal(pickTab(tabs, 'https://a.vn/x').id, 1);
assert.equal(pickTab(tabs, 'https://c.vn/'), null);
assert.equal(validateState({ ...d, settings: { ...d.settings, switchTab: false } }).settings.switchTab, false);
const old = structuredClone(d); delete old.settings.switchTab;
assert.equal(validateState(old).settings.switchTab, true); // older installs: on
assert.equal(validateState(old).settings.mode, 'ios');
assert.equal(validateState({ ...d, settings: { ...d.settings, mode: 'mac' } }).settings.mode, 'mac');
assert.equal(validateState({ ...d, settings: { ...d.settings, mode: 'android' } }).settings.mode, 'ios');
// control center / lock settings
const cc = v => validateState({ ...d, settings: { ...d.settings, ...v } }).settings;
assert.deepEqual([cc({ theme: 'dark' }).theme, cc({ theme: 'pink' }).theme], ['dark', 'auto']);
assert.deepEqual([cc({ focus: true }).focus, cc({ focus: 'yes' }).focus], [true, false]);
assert.deepEqual([cc({ lock: 0 }).lock, cc({ lock: 15 }).lock, cc({ lock: 7 }).lock, cc({ lock: '5' }).lock], [0, 15, 5, 5]);

// spotlight: diacritic-insensitive, prefix > word > substring, tabs before shortcuts on ties, one row per URL
assert.equal(score('Ghi chú học tập', 'chu'), 2);
assert.equal(score('YouTube', 'you'), 3);
assert.equal(score('Đường đua', 'duong'), 3);
assert.equal(score('playlist', 'list'), 1);
assert.equal(score('abc', 'x'), 0);
const sr = rank([
  { kind: 'history', title: 'Mail', url: 'https://mail.google.com/' },
  { kind: 'link', title: 'Gmail', url: 'https://mail.google.com/' },
  { kind: 'tab', title: 'Inbox - Gmail', url: 'https://mail.google.com/mail/u/0' },
  { kind: 'link', title: 'GitHub', url: 'https://github.com/' },
], 'mail');
assert.deepEqual(sr.map(r => r.kind + ':' + r.url), ['tab:https://mail.google.com/mail/u/0', 'link:https://mail.google.com/']);
assert.deepEqual(rank([{ kind: 'link', title: 'x', url: 'https://x.vn/' }], '  '), []);
assert.equal(typedUrl('vnexpress.net'), 'https://vnexpress.net/');
assert.equal(typedUrl('http://a.b/c'), 'http://a.b/c');
assert.equal(typedUrl('hello world'), null);
assert.equal(typedUrl('javascript:alert(1)'), null);

// switcher card tint: average of the coloured pixels, ignores transparency/white/black
const { avgColor } = await import('../switcher.js');
assert.deepEqual(avgColor(px(4, x => (x < 2 ? [200, 0, 0, 255] : [255, 255, 255, 255]))), [200, 0, 0]);
assert.deepEqual(avgColor(px(4, x => (x < 2 ? [0, 0, 200, 255] : [0, 255, 0, 0]))), [0, 0, 200]);
assert.equal(avgColor(px(4, () => [255, 255, 255, 255])), null);

const { shortTime } = await import('../device.js');
const nine = new Date(2026, 0, 1, 21, 41);
assert.equal(shortTime(nine, 'en-US'), '9:41');
assert.equal(shortTime(nine, 'vi-VN'), '21:41');

console.log('ok');
