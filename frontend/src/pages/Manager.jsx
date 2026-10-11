import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, managerKey, todayIST, fmtTime } from '../api.js';
import { usePolling } from '../usePolling.js';

const DEFAULT_DISHES = 'Rice, 125\nDal, 75\nSabzi, 100\nRoti, 80';

function Passcode({ onOk }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    managerKey.set(key);
    try { await api.auth(); onOk(); } catch { managerKey.clear(); setErr('Wrong passcode'); }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <label className="big-label" htmlFor="pc">Manager passcode</label>
      <input id="pc" className="big-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
      {err && <p className="error">{err}</p>}
      <button className="btn primary full">Open dashboard</button>
    </form>
  );
}

function CreateMeal({ date, onCreated }) {
  const [mealType, setMealType] = useState('LUNCH');
  const saved = JSON.parse(localStorage.getItem(`mw_last_${mealType}`) || 'null');
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setF({
      cutoff: saved?.cutoff || (mealType === 'BREAKFAST' ? '06:30' : mealType === 'LUNCH' ? '11:00' : '18:30'),
      bufferPct: saved?.bufferPct ?? 5, registeredStudents: saved?.registeredStudents ?? 50,
      coldStartShowRate: saved?.coldStartShowRate ?? 40, baselineKg: saved?.baselineKg ?? 20,
      lpgPerKgCooked: saved?.lpgPerKgCooked ?? 0.05, dishes: saved?.dishes || DEFAULT_DISHES,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealType]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr('');
    const dishes = f.dishes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, g] = l.split(',').map((s) => s.trim());
      return { name, gramsPerPortion: Number(g) };
    });
    try {
      await api.createMeal({
        date, mealType, cutoffAt: `${date}T${f.cutoff}:00+05:30`, bufferPct: Number(f.bufferPct),
        registeredStudents: Number(f.registeredStudents), coldStartShowRate: Number(f.coldStartShowRate) / 100,
        baselineKg: Number(f.baselineKg), lpgPerKgCooked: Number(f.lpgPerKgCooked), dishes,
      });
      localStorage.setItem(`mw_last_${mealType}`, JSON.stringify(f));
      onCreated(`${date}_${mealType}`);
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h3>Create a meal for {date}</h3>
      <div className="grid2">
        <label>Meal<select value={mealType} onChange={(e) => setMealType(e.target.value)}>
          <option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option></select></label>
        <label>Check-in cutoff (IST)<input type="time" value={f.cutoff} onChange={set('cutoff')} required /></label>
        <label>Students in pilot group<input type="number" min="1" value={f.registeredStudents} onChange={set('registeredStudents')} required /></label>
        <label>Safety buffer (%)<input type="number" min="0" max="50" value={f.bufferPct} onChange={set('bufferPct')} /></label>
        <label>No-response show rate (%) <small>assumption until learned</small><input type="number" min="0" max="100" value={f.coldStartShowRate} onChange={set('coldStartShowRate')} /></label>
        <label>Usual cooked for this group (kg) <small>baseline</small><input type="number" min="0" step="0.1" value={f.baselineKg} onChange={set('baselineKg')} required /></label>
        <label>LPG per kg cooked (kg) <small>assumption</small><input type="number" min="0" step="0.001" value={f.lpgPerKgCooked} onChange={set('lpgPerKgCooked')} /></label>
      </div>
      <label>Dishes, one per line: name, grams per portion
        <textarea rows="4" value={f.dishes} onChange={set('dishes')} /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary">Create meal</button>
    </form>
  );
}

function RecCard({ meal }) {
  const [rec, setRec] = useState(null);
  const [buffer, setBuffer] = useState(meal.bufferPct);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { const r = await api.recommendation(meal.mealId); setRec(r); setErr(''); } catch (e) { setErr(e.message); }
  }, [meal.mealId]);
  usePolling(load, 10000);
  useEffect(() => { if (rec?.bufferPct !== undefined) setBuffer(rec.bufferPct); }, [rec?.bufferPct]);

  if (!rec) return <div className="panel">{err || 'Loading…'}</div>;
  const open = rec.status === 'OPEN';
  // live preview while dragging; server value wins after save
  const portions = open ? Math.ceil(Number((rec.expected * (1 + buffer / 100)).toFixed(6))) : rec.portions;
  const dishes = open ? meal.dishes.map((d) => ({ name: d.name, kg: Math.round((portions * d.gramsPerPortion) / 100) / 10 })) : rec.kgPerDish;

  async function commitBuffer() {
    try { await api.setBuffer(meal.mealId, buffer); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <section className="rec">
      <div className="rec-top">
        <span className={`pill ${rec.status.toLowerCase()}`}>{rec.status}</span>
        <span className="hint">Cutoff {fmtTime(meal.cutoffAt)}</span>
      </div>
      <p className="portions"><span className="n">{portions}</span> portions</p>
      <ul className="dishes">
        {dishes.map((d) => <li key={d.name}><span>{d.name}</span><b>{d.kg.toFixed(1)} kg</b></li>)}
      </ul>
      <p className="explain">{open && buffer !== rec.bufferPct ? `Preview with ${buffer}% buffer. Release the slider to save.` : rec.explanation}</p>
      <div className="chips">
        <span className="chip in">{rec.confirmed} eating</span>
        <span className="chip out">{rec.skipped} skipping</span>
        <span className="chip nr">{rec.noResponse} no response</span>
        <span className={`chip src ${rec.showRateSource}`}>
          show rate {Math.round(rec.showRate * 100)}% · {rec.showRateSource === 'learned' ? `learned from ${rec.showRateSamples} meals` : 'assumption'}
        </span>
      </div>
      {open && (
        <label className="slider">Safety buffer: <b>{buffer}%</b>
          <input type="range" min="0" max="15" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}
            onMouseUp={commitBuffer} onTouchEnd={commitBuffer} onKeyUp={commitBuffer} />
        </label>
      )}
      {err && <p className="error">{err}</p>}
      {rec.status === 'CLOSED' && rec.outcome ? (
        <p className="done">Logged: {rec.outcome.portionsServed} served, {rec.outcome.leftoverKg} kg left over, {rec.outcome.unservedCount} unserved.</p>
      ) : (
        <Link className="btn ghost" to={`/outcome/${encodeURIComponent(meal.mealId)}`}>Log what happened after the meal</Link>
      )}
    </section>
  );
}

export default function Manager() {
  const [authed, setAuthed] = useState(!!managerKey.get());
  const [date, setDate] = useState(todayIST());
  const [meals, setMeals] = useState([]);
  const [selected, setSelected] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listMeals(date);
      setMeals(r.meals);
      setSelected((s) => s || r.meals.find((m) => m.status === 'OPEN')?.mealId || r.meals[0]?.mealId || '');
    } catch { /* shown in card */ }
  }, [date]);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (!authed) return <Passcode onOk={() => setAuthed(true)} />;
  const meal = meals.find((m) => m.mealId === selected);
  const checkinUrl = `${window.location.origin}${window.location.pathname}#/checkin`;

  return (
    <div className="stack wide">
      <div className="toolbar">
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelected(''); }} />
        {meals.map((m) => (
          <button key={m.mealId} className={`tab ${m.mealId === selected ? 'on' : ''}`} onClick={() => setSelected(m.mealId)}>
            {m.mealType.toLowerCase()} {m.sample ? '(sample)' : ''}
          </button>
        ))}
        <button className="btn ghost" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close form' : 'New meal'}</button>
        <button className="btn ghost" onClick={() => setShowQR((v) => !v)}>QR for mess door</button>
      </div>
      {showQR && (
        <div className="panel qr">
          <QRCodeSVG value={checkinUrl} size={220} />
          <p><b>Skipping a meal? Tell the mess.</b><br />Scan, enter roll number, tap once.</p>
          <p className="hint">{checkinUrl}</p>
          <button className="btn ghost" onClick={() => window.print()}>Print</button>
        </div>
      )}
      {showForm && <CreateMeal date={date} onCreated={(id) => { setShowForm(false); setSelected(id); load(); }} />}
      {meal ? <RecCard key={meal.mealId} meal={meal} /> : !showForm && <p className="panel">No meals for this date. Tap “New meal”.</p>}
    </div>
  );
}
