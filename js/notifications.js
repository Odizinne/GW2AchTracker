const LS_KEY   = "gw2_reminders";
const AUDIO_SRC = "assets/audio/notification.mp3";

let _volume    = 0.7;
let _interval  = null;
let _lastMin   = -1;

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

function save(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

export function getReminders() { return load(); }

export function removeReminder(id) {
  save(load().filter(r => r.id !== id));
}

export function addReminder(data) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  save([{ ...data, id }]); // one at a time: replaces any existing reminder
}

export function setVolume(vol) {
  _volume = Math.max(0, Math.min(1, vol));
}

export function playNotificationSound() {
  const audio = new Audio(AUDIO_SRC);
  audio.volume = _volume;
  audio.play().catch(() => {});
}

export function initNotifications(volume, onFire, onTick) {
  _volume = volume;
  if (_interval) clearInterval(_interval);

  const now = Date.now();
  save(load().filter(r => !r.fireAt || r.fireAt > now));

  _interval = setInterval(() => {
    const all = load();
    onTick?.(all);

    const now    = new Date();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (nowMin === _lastMin) return;
    _lastMin = nowMin;

    const firing = all.filter(r => r.utcFireMin === nowMin);
    if (!firing.length) return;

    save(all.filter(r => r.utcFireMin !== nowMin));
    playNotificationSound();
    onFire(firing[0]);
  }, 1000);
}
