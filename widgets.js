// Widget renderers. Each returns the inner content for a .widget element.
import { uid } from './state.js';
import { renderWeather } from './weather.js';

export const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
};

function clock() {
  const s = svg('svg', { viewBox: '-100 -100 200 200', class: 'w-clock' });
  s.append(svg('circle', { r: 92, class: 'face' }));
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, r1 = i % 3 ? 80 : 72;
    s.append(svg('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 86, y2: -Math.cos(a) * 86, class: i % 3 ? 'tick' : 'tick major' }));
  }
  s.append(
    svg('line', { y2: -46, class: 'hand hour' }),
    svg('line', { y2: -68, class: 'hand min' }),
    svg('line', { y1: 14, y2: -76, class: 'hand sec' }),
    svg('circle', { r: 4, class: 'pin' }),
  );
  return [s];
}

function date() {
  return [h('div', 'dow'), h('div', 'day'), h('div', 'mon')];
}

// Update every clock/date widget on screen. Called once per second.
export function tick() {
  const d = new Date();
  const sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
  for (const c of document.querySelectorAll('.w-clock')) {
    c.querySelector('.hour').setAttribute('transform', `rotate(${hr * 30})`);
    c.querySelector('.min').setAttribute('transform', `rotate(${min * 6})`);
    c.querySelector('.sec').setAttribute('transform', `rotate(${sec * 6})`);
  }
  const dow = d.toLocaleDateString('vi-VN', { weekday: 'long' });
  const mon = `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  for (const w of document.querySelectorAll('[data-kind="date"]')) {
    w.querySelector('.dow').textContent = dow;
    w.querySelector('.day').textContent = d.getDate();
    w.querySelector('.mon').textContent = mon;
  }
}

function note(item, { state, save }) {
  const ta = h('textarea', 'w-note');
  ta.placeholder = 'Viết gì đó…';
  ta.value = state.notes[item.id] || '';
  let t;
  ta.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.notes[item.id] = ta.value; save(); }, 500);
  });
  return [h('div', 'w-title', 'Ghi chú'), ta];
}

function todo(item, { state, save }) {
  const title = h('div', 'w-title');
  const list = h('ul', 'todo-list');
  const form = h('form', 'todo-add');
  const input = h('input');
  input.placeholder = '+ Thêm việc';
  input.maxLength = 500;
  form.append(input);

  const items = () => (state.todos[item.id] ||= []);
  const draw = () => {
    const all = items();
    title.textContent = `Việc cần làm · ${all.filter(t => !t.done).length}`;
    list.replaceChildren(...[...all].sort((a, b) => a.done - b.done).map(t => {
      const li = h('li', t.done ? 'done' : '');
      const cb = h('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.addEventListener('change', () => { t.done = cb.checked; save(); draw(); });
      const x = h('button', 'todo-del', '×');
      x.type = 'button';
      x.title = 'Xóa';
      x.addEventListener('click', () => {
        state.todos[item.id] = items().filter(o => o !== t);
        save(); draw();
      });
      li.append(cb, h('span', null, t.text), x);
      return li;
    }));
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    items().push({ id: uid(), text, done: false });
    input.value = '';
    save(); draw();
  });
  draw();
  return [title, list, form];
}

const RENDER = { clock, date, note, todo, weather: renderWeather };

export function renderWidget(item, ctx) {
  return RENDER[item.kind](item, ctx);
}
