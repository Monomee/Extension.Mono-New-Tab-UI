// Widget renderers. Each returns the inner content for a .widget element.
import { uid } from './state.js';
import { renderWeather } from './weather.js';
import { t, locale } from './i18n.js';

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

function date(item) {
  return [h('div', 'dow'), h('div', 'day'), h('div', 'mon'), ...(item.w >= 4 ? [h('div', 'cal')] : [])];
}

// Monday-first month grid; rebuilt only when the day changes.
function fillCal(cal, d) {
  const key = d.toDateString() + locale();
  if (cal.dataset.key === key) return;
  cal.dataset.key = key;
  const lead = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const wd = i => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }); // 2024-01-01 = Monday
  cal.replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => h('span', 'wd', wd(i))),
    ...Array.from({ length: lead }, () => h('span')),
    ...Array.from({ length: days }, (_, i) => h('span', i + 1 === d.getDate() ? 'today' : '', i + 1)),
  );
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
  const dow = d.toLocaleDateString(locale(), { weekday: 'long' });
  const mon = t('date.month', { m: d.getMonth() + 1, y: d.getFullYear(), month: d.toLocaleDateString(locale(), { month: 'long' }) });
  for (const w of document.querySelectorAll('[data-kind="date"]')) {
    w.querySelector('.dow').textContent = dow;
    w.querySelector('.day').textContent = d.getDate();
    w.querySelector('.mon').textContent = mon;
    const cal = w.querySelector('.cal');
    if (cal) fillCal(cal, d);
  }
}

function note(item, { state, save }) {
  const ta = h('textarea', 'w-note');
  ta.placeholder = t('note.ph');
  ta.value = state.notes[item.id] || '';
  let timer;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.notes[item.id] = ta.value; save(); }, 500);
  });
  return [h('div', 'w-title', t('note.title')), ta];
}

function todo(item, { state, save }) {
  const title = h('div', 'w-title');
  const list = h('ul', 'todo-list');
  const form = h('form', 'todo-add');
  const input = h('input');
  input.placeholder = t('todo.ph');
  input.maxLength = 500;
  form.append(input);

  const items = () => (state.todos[item.id] ||= []);
  const draw = () => {
    const all = items();
    title.textContent = t('todo.title', { n: all.filter(x => !x.done).length });
    list.replaceChildren(...[...all].sort((a, b) => a.done - b.done).map(it => {
      const li = h('li', it.done ? 'done' : '');
      const cb = h('input');
      cb.type = 'checkbox';
      cb.checked = it.done;
      cb.addEventListener('change', () => { it.done = cb.checked; save(); draw(); });
      const x = h('button', 'todo-del', '×');
      x.type = 'button';
      x.title = t('del');
      x.addEventListener('click', () => {
        state.todos[item.id] = items().filter(o => o !== it);
        save(); draw();
      });
      li.append(cb, h('span', null, it.text), x);
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
