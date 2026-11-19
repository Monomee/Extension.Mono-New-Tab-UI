// Device look: iPad (status bar) or Mac (menu bar + magnifying dock). Clock, Wi-Fi and battery are live.
import { locale } from './i18n.js';

export const MODES = ['ios', 'mac'];
export const applyMode = mode => document.body.classList.toggle('mac', mode === 'mac');

export function initBar(actions) {
  const $ = s => document.querySelector(s);
  for (const [id, fn] of Object.entries(actions)) $('#' + id).onclick = fn;

  const tick = () => {
    const d = new Date(), hm = { hour: '2-digit', minute: '2-digit' };
    $('.bar-time').textContent = d.toLocaleTimeString(locale(), hm);
    $('.bar-clock').textContent = d.toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', ...hm });
  };
  tick();
  setInterval(tick, 1000);

  const net = () => $('#wifi').classList.toggle('off', !navigator.onLine);
  addEventListener('online', net);
  addEventListener('offline', net);
  net();

  // No Battery API (Firefox/Safari) → the icon stays hidden. Desktops report 100% + charging.
  navigator.getBattery?.().then(b => {
    const bat = $('#bat');
    const draw = () => {
      bat.hidden = false;
      bat.style.setProperty('--lvl', b.level);
      bat.querySelector('.bat-pct').textContent = Math.round(b.level * 100) + '%';
      bat.classList.toggle('charging', b.charging);
      bat.classList.toggle('low', b.level <= 0.2 && !b.charging);
    };
    b.addEventListener('levelchange', draw);
    b.addEventListener('chargingchange', draw);
    draw();
  }).catch(() => {});
}
