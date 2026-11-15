import assert from 'node:assert/strict';
import { normalizeUrl, defaultState, validateState } from '../state.js';

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

console.log('ok');
