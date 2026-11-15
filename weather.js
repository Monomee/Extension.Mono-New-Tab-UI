// Weather widget — Open-Meteo (free, no API key, CORS-enabled). Only called when a weather widget exists.
import { h } from './widgets.js';

const CODES = [
  [[0], '☀️', '🌙', 'Trời quang'],
  [[1], '🌤️', '🌙', 'Ít mây'],
  [[2], '⛅', '☁️', 'Có mây'],
  [[3], '☁️', '☁️', 'Nhiều mây'],
  [[45, 48], '🌫️', '🌫️', 'Sương mù'],
  [[51, 53, 55, 56, 57], '🌦️', '🌧️', 'Mưa phùn'],
  [[61, 63, 66], '🌧️', '🌧️', 'Mưa'],
  [[65, 67], '🌧️', '🌧️', 'Mưa to'],
  [[71, 73, 75, 77], '🌨️', '🌨️', 'Tuyết'],
  [[80, 81, 82], '🌦️', '🌧️', 'Mưa rào'],
  [[85, 86], '🌨️', '🌨️', 'Mưa tuyết'],
  [[95], '⛈️', '⛈️', 'Dông'],
  [[96, 99], '⛈️', '⛈️', 'Dông kèm mưa đá'],
];
export function describeWeather(code, isDay) {
  const row = CODES.find(([codes]) => codes.includes(code));
  return row ? { icon: isDay ? row[1] : row[2], text: row[3] } : { icon: '🌡️', text: 'Không rõ' };
}

const TTL = 30 * 60e3;
const inflight = new Map();
const getJson = url => fetch(url).then(r => {
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
});

// Cached in chrome.storage.local for 30 min so every new tab doesn't hit the API.
async function getWeather(city) {
  const key = `${city.lat},${city.lon}`;
  const { weatherCache: c } = await chrome.storage.local.get('weatherCache');
  if (c?.key === key && Date.now() - c.at < TTL) return c.data;
  if (!inflight.has(key)) {
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: city.lat, longitude: city.lon, timezone: 'auto', forecast_days: 5,
      current: 'temperature_2m,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    });
    inflight.set(key, getJson(url).finally(() => inflight.delete(key)));
  }
  try {
    const data = await inflight.get(key);
    await chrome.storage.local.set({ weatherCache: { key, at: Date.now(), data } });
    return data;
  } catch (e) {
    if (c?.key === key) return c.data; // offline: stale beats nothing
    throw e;
  }
}

const searchCity = q => getJson('https://geocoding-api.open-meteo.com/v1/search?' +
  new URLSearchParams({ name: q, count: 5, language: 'vi' })).then(d => d.results || []);

const deg = t => `${Math.round(t)}°`;

function setupForm(box, ctx, onCancel) {
  const form = h('form', 'wx-setup'), input = h('input'), list = h('div', 'wx-results');
  input.placeholder = 'Nhập thành phố…';
  input.maxLength = 80;
  form.append(input);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    list.replaceChildren(h('span', 'wx-muted', 'Đang tìm…'));
    try {
      const found = await searchCity(q);
      list.replaceChildren(...(found.length ? found.map(r => {
        const b = h('button', 'wx-pick', [r.name, r.admin1, r.country].filter(Boolean).join(', '));
        b.type = 'button';
        b.onclick = () => {
          ctx.state.settings.city = { name: r.name, lat: r.latitude, lon: r.longitude };
          ctx.save();
          ctx.render();
        };
        return b;
      }) : [h('span', 'wx-muted', 'Không tìm thấy.')]));
    } catch {
      list.replaceChildren(h('span', 'wx-muted', 'Lỗi mạng, thử lại sau.'));
    }
  });
  const head = h('div', 'w-title', 'Thời tiết');
  if (onCancel) {
    const x = h('button', 'wx-link', 'Hủy');
    x.type = 'button';
    x.onclick = onCancel;
    head.append(' · ', x);
  }
  box.classList.remove('wide');
  box.replaceChildren(head, form, list);
  input.focus({ preventScroll: true });
}

function show(box, item, ctx, data) {
  const city = ctx.state.settings.city, cur = data.current, d = data.daily;
  const now = describeWeather(cur.weather_code, cur.is_day);
  const name = h('button', 'wx-link wx-city', city.name + ' ›');
  name.type = 'button';
  name.title = 'Đổi thành phố';
  name.onclick = () => setupForm(box, ctx, () => show(box, item, ctx, data));

  const main = h('div', 'wx-now');
  main.append(
    name,
    h('div', 'wx-temp', deg(cur.temperature_2m)),
    h('div', 'wx-icon', now.icon),
    h('div', 'wx-desc', now.text),
    h('div', 'wx-range', `C:${deg(d.temperature_2m_max[0])}  T:${deg(d.temperature_2m_min[0])}`),
  );
  box.classList.toggle('wide', item.w >= 4);
  if (item.w < 4) return box.replaceChildren(main);

  const days = h('div', 'wx-days');
  days.append(...d.time.map((t, i) => {
    const col = h('div', 'wx-day');
    const label = i ? new Date(t + 'T00:00').toLocaleDateString('vi-VN', { weekday: 'short' }) : 'Nay';
    col.append(h('span', null, label), h('span', 'wx-di', describeWeather(d.weather_code[i], true).icon),
      h('b', null, deg(d.temperature_2m_max[i])), h('span', 'wx-muted', deg(d.temperature_2m_min[i])));
    return col;
  }));
  box.replaceChildren(main, days);
}

export function renderWeather(item, ctx) {
  const box = h('div', 'wx');
  const city = ctx.state.settings.city;
  if (!city) { setupForm(box, ctx); return [box]; }
  box.append(h('span', 'wx-muted', 'Đang tải…'));
  getWeather(city).then(data => show(box, item, ctx, data)).catch(() => {
    const retry = h('button', 'wx-link', 'Thử lại');
    retry.type = 'button';
    retry.onclick = ctx.render;
    box.replaceChildren(h('div', 'w-title', city.name), h('span', 'wx-muted', 'Không tải được thời tiết. '), retry);
  });
  return [box];
}
