// Device look: iPad (status bar) or Mac (menu bar + magnifying dock). Clock, Wi-Fi and battery are live.
import { locale } from './i18n.js';

export const MODES = ['ios', 'mac'];
export const LOCK_MINUTES = [0, 1, 5, 15, 30]; // 0 = never
// iPhone-style clock: "9:41", no AM/PM
export const shortTime = (d, loc) => d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }).replace(/\s*[AP]M$/i, '');
export const applyMode = mode => document.body.classList.toggle('mac', mode === 'mac');

export function initBar(actions) {
  const $ = s => document.querySelector(s);
  for (const [id, fn] of Object.entries(actions)) $('#' + id).onclick = fn;

  const tick = () => {
    const d = new Date();
    $('.bar-time').textContent = shortTime(d, locale());
    $('.bar-clock').textContent = d.toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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

// Lock screen: big clock over the bare wallpaper after `minutes()` without input while this tab
// is visible (never while editing or a panel/dialog is open). Any click or key unlocks.
export function initLock({ minutes, busy }) {
  const $lock = document.querySelector('#lock'), body = document.body;
  let last = Date.now();
  const draw = () => {
    const d = new Date();
    $lock.querySelector('.lock-time').textContent = shortTime(d, locale());
    $lock.querySelector('.lock-date').textContent = d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  };
  function lock() {
    draw();
    $lock.classList.remove('out');
    body.classList.add('locked');
  }
  function unlock() {
    if (!body.classList.contains('locked') || $lock.classList.contains('out')) return;
    $lock.classList.add('out');
    setTimeout(() => { body.classList.remove('locked'); $lock.classList.remove('out'); }, 400);
  }
  const poke = e => {
    last = Date.now();
    if (e.type !== 'pointermove' && body.classList.contains('locked')) { e.preventDefault(); e.stopPropagation(); unlock(); }
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'pointermove']) addEventListener(ev, poke, { capture: true, passive: false });
  document.addEventListener('visibilitychange', () => { last = Date.now(); });
  setInterval(() => {
    if (body.classList.contains('locked')) return draw();
    const m = minutes();
    if (m && !document.hidden && !busy() && Date.now() - last > m * 60e3) lock();
  }, 1000);
  return { lock };
}
