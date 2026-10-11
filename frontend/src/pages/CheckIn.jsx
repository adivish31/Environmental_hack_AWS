import { useCallback, useEffect, useState } from 'react';
import { api, todayIST, timeLeft, fmtTime } from '../api.js';
import { usePolling } from '../usePolling.js';
import { useT } from '../i18n.jsx';

export default function CheckIn() {
  const { t } = useT();
  const [roll, setRoll] = useState(localStorage.getItem('mw_roll') || '');
  const [draft, setDraft] = useState('');
  const [meals, setMeals] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const load = useCallback(async () => {
    if (!roll) return;
    try { const r = await api.listMeals(todayIST(), roll); setMeals(r.meals); setErr(''); }
    catch (e) { setErr(e.message); }
  }, [roll]);
  usePolling(load, 15000);

  function saveRoll(e) {
    e.preventDefault();
    const r = draft.trim().toUpperCase();
    if (r.length < 2) return;
    localStorage.setItem('mw_roll', r);
    setRoll(r);
  }

  async function choose(meal, status) {
    setBusy(meal.mealId);
    setMeals((ms) => ms.map((m) => (m.mealId === meal.mealId ? { ...m, myStatus: status } : m)));
    try { await api.checkin(meal.mealId, roll, status); setErr(''); }
    catch (e) { setErr(e.message); load(); }
    finally { setBusy(''); }
  }

  if (!roll) {
    return (
      <form className="panel narrow" onSubmit={saveRoll}>
        <label htmlFor="roll" className="big-label">{t('rollPrompt')}</label>
        <input id="roll" className="big-input" autoFocus autoCapitalize="characters" placeholder="BTECH/10123/23"
          value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="hint">{t('rollHint')}</p>
        <button className="btn primary full" type="submit">{t('continue')}</button>
      </form>
    );
  }

  return (
    <div className="stack">
      <div className="who">
        <span>{roll}</span>
        <button className="link" onClick={() => { localStorage.removeItem('mw_roll'); setRoll(''); setMeals(null); }}>{t('change')}</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {meals === null && !err && <p className="hint">Loading today's meals…</p>}
      {meals?.length === 0 && <p className="panel">{t('noMeals')}</p>}
      {meals?.map((m) => {
        const left = timeLeft(m.cutoffAt, now);
        const open = m.status === 'OPEN' && left;
        return (
          <section key={m.mealId} className={`meal ${open ? '' : 'meal-locked'}`}>
            <div className="meal-head">
              <h2>{t(m.mealType)}</h2>
              <span className="when">{open ? `${t('closesIn')} ${left}` : fmtTime(m.cutoffAt)}</span>
            </div>
            <p className="menu">{m.dishes.map((d) => d.name).join(' · ')}</p>
            {open ? (
              <div className="choice">
                <button disabled={busy === m.mealId} className={`btn eat ${m.myStatus === 'IN' ? 'on' : ''}`} onClick={() => choose(m, 'IN')} aria-pressed={m.myStatus === 'IN'}>{t('eating')}</button>
                <button disabled={busy === m.mealId} className={`btn skip ${m.myStatus === 'OUT' ? 'on' : ''}`} onClick={() => choose(m, 'OUT')} aria-pressed={m.myStatus === 'OUT'}>{t('skipping')}</button>
              </div>
            ) : (
              <p className="locked-note">{t('locked')}</p>
            )}
            <p className="hint">{t('youSaid')}: {m.myStatus === 'IN' ? t('eating') : m.myStatus === 'OUT' ? t('skipping') : t('notYet')}</p>
          </section>
        );
      })}
    </div>
  );
}
