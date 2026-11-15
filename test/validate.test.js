import assert from 'node:assert/strict';
import { normalizeUrl, defaultState, validateState } from '../state.js';
import { describeWeather } from '../weather.js';

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

// weather codes
assert.deepEqual(describeWeather(0, true), { icon: '☀️', text: 'Trời quang' });
assert.equal(describeWeather(0, false).icon, '🌙');
assert.equal(describeWeather(63, true).text, 'Mưa');
assert.equal(describeWeather(12345, true).text, 'Không rõ');

console.log('ok');
