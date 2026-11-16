// Weather widget — Open-Meteo (free, no API key, CORS-enabled). Only called when a weather widget exists.
import { h } from './widgets.js';
import { t, locale } from './i18n.js';

const CODES = [
  [[0], '☀️', '🌙', 'clear'],
  [[1], '🌤️', '🌙', 'few'],
  [[2], '⛅', '☁️', 'partly'],
  [[3], '☁️', '☁️', 'overcast'],
  [[45, 48], '🌫️', '🌫️', 'fog'],
  [[51, 53, 55, 56, 57], '🌦️', '🌧️', 'drizzle'],
  [[61, 63, 66], '🌧️', '🌧️', 'rain'],
  [[65, 67], '🌧️', '🌧️', 'heavyRain'],
  [[71, 73, 75, 77], '🌨️', '🌨️', 'snow'],
  [[80, 81, 82], '🌦️', '🌧️', 'showers'],
  [[85, 86], '🌨️', '🌨️', 'snowShowers'],
  [[95], '⛈️', '⛈️', 'storm'],
  [[96, 99], '⛈️', '⛈️', 'hail'],
];
export function describeWeather(code, isDay) {
  const row = CODES.find(([codes]) => codes.includes(code));
  return row ? { icon: isDay ? row[1] : row[2], text: t('wx.' + row[3]) } : { icon: '🌡️', text: t('wx.unknown') };
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
  new URLSearchParams({ name: q, count: 5, language: locale().slice(0, 2) })).then(d => d.results || []);

const deg = v => `${Math.round(v)}°`;

function setupForm(box, ctx, onCancel) {
  const form = h('form', 'wx-setup'), input = h('input'), list = h('div', 'wx-results');
  input.placeholder = t('wx.city.ph');
  input.maxLength = 80;
  form.append(input);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    list.replaceChildren(h('span', 'wx-muted', t('wx.searching')));
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
      }) : [h('span', 'wx-muted', t('wx.notFound'))]));
    } catch {
      list.replaceChildren(h('span', 'wx-muted', t('wx.netErr')));
    }
  });
  const head = h('div', 'w-title', t('wx.title'));
  if (onCancel) {
    const x = h('button', 'wx-link', t('cancel'));
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
  name.title = t('wx.change');
  name.onclick = () => setupForm(box, ctx, () => show(box, item, ctx, data));

  const main = h('div', 'wx-now');
  main.append(
    name,
    h('div', 'wx-temp', deg(cur.temperature_2m)),
    h('div', 'wx-icon', now.icon),
    h('div', 'wx-desc', now.text),
    h('div', 'wx-range', t('wx.range', { max: deg(d.temperature_2m_max[0]), min: deg(d.temperature_2m_min[0]) })),
  );
  box.classList.toggle('wide', item.w >= 4);
  if (item.w < 4) return box.replaceChildren(main);

  const days = h('div', 'wx-days');
  days.append(...d.time.map((day, i) => {
    const col = h('div', 'wx-day');
    const label = i ? new Date(day + 'T00:00').toLocaleDateString(locale(), { weekday: 'short' }) : t('wx.today');
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
  box.append(h('span', 'wx-muted', t('wx.loading')));
  getWeather(city).then(data => show(box, item, ctx, data)).catch(() => {
    const retry = h('button', 'wx-link', t('wx.retry'));
    retry.type = 'button';
    retry.onclick = ctx.render;
    box.replaceChildren(h('div', 'w-title', city.name), h('span', 'wx-muted', t('wx.loadFail')), retry);
  });
  return [box];
}
