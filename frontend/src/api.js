const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const managerKey = {
  get: () => sessionStorage.getItem('mw_key') || '',
  set: (k) => sessionStorage.setItem('mw_key', k),
  clear: () => sessionStorage.removeItem('mw_key'),
};

async function req(path, { method = 'GET', body, manager = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (manager) headers['x-manager-key'] = managerKey.get();
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;
export const api = {
  auth: () => req('/auth', { manager: true }),
  listMeals: (date, roll) => req(`/meals?date=${enc(date)}${roll ? `&roll=${enc(roll)}` : ''}`),
  createMeal: (meal) => req('/meals', { method: 'POST', body: meal, manager: true }),
  setBuffer: (mealId, bufferPct) => req(`/meals/${enc(mealId)}`, { method: 'PATCH', body: { bufferPct }, manager: true }),
  checkin: (mealId, roll, status) => req(`/meals/${enc(mealId)}/checkin`, { method: 'PUT', body: { roll, status } }),
  recommendation: (mealId) => req(`/meals/${enc(mealId)}/recommendation`),
  outcome: (mealId, o) => req(`/meals/${enc(mealId)}/outcome`, { method: 'POST', body: o, manager: true }),
  stats: () => req('/stats'),
};

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function timeLeft(cutoffAt, now) {
  const ms = Date.parse(cutoffAt) - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
