import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, managerKey } from '../api.js';

export default function Outcome() {
  const { mealId } = useParams();
  const [f, setF] = useState({ portionsServed: '', leftoverKg: '', unservedCount: '0' });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!managerKey.get()) return <p className="panel">Open the <Link to="/manager">manager dashboard</Link> and enter the passcode first.</p>;

  async function submit(e) {
    e.preventDefault(); setErr('');
    try { setRes(await api.outcome(mealId, f)); } catch (e2) { setErr(e2.message); }
  }

  if (res) {
    return (
      <div className="panel narrow result">
        <h2>Logged for {mealId.replace('_', ' ').toLowerCase()}</h2>
        {res.warning && <p className="warn">{res.warning} Saving food must never mean a student goes hungry.</p>}
        <p className="big-stat">{res.leftoverKg} kg <span>left over (measured)</span></p>
        <p className="big-stat">{res.foodSavedKg} kg <span>less cooked than the usual {res.baselineKg} kg</span></p>
        <p className="big-stat">{res.lpgSavedKg} kg <span>LPG saved (estimate)</span></p>
        <Link className="btn primary full" to="/impact">See impact</Link>
      </div>
    );
  }

  return (
    <form className="panel narrow form" onSubmit={submit}>
      <h2>After the meal</h2>
      <label>Portions served<input className="big-input" inputMode="numeric" type="number" min="0" value={f.portionsServed} onChange={set('portionsServed')} required /></label>
      <label>Leftover food (kg)<input className="big-input" inputMode="decimal" type="number" min="0" step="0.1" value={f.leftoverKg} onChange={set('leftoverKg')} required /></label>
      <label>Students who went unserved<input className="big-input" inputMode="numeric" type="number" min="0" value={f.unservedCount} onChange={set('unservedCount')} required /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary full">Save outcome</button>
    </form>
  );
}
