import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';

const label = (m) => `${m.date.slice(5)} ${m.mealType[0]}${m.mealType.slice(1).toLowerCase()}`;

export default function Impact() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.stats().then(setData).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="hint">Loading…</p>;
  const rows = data.meals.map((m) => ({ ...m, name: label(m) + (m.sample ? ' *' : '') }));
  const t = data.totals;

  return (
    <div className="stack wide">
      {data.hasSample && <p className="banner">Sample data: bars marked * are seeded examples, not measured meals.</p>}
      <div className="totals">
        <div><b>{t.meals}</b><span>meals logged</span></div>
        <div><b>{t.leftoverKg} kg</b><span>leftover, measured</span></div>
        <div><b>{t.foodSavedKg} kg</b><span>less food cooked vs usual (estimate)</span></div>
        <div><b>{t.lpgSavedKg} kg</b><span>LPG saved (estimate)</span></div>
        <div className={t.unservedCount > 0 ? 'bad' : ''}><b>{t.unservedCount}</b><span>students unserved</span></div>
      </div>
      {rows.length === 0 ? <p className="panel">No outcomes logged yet. Log a meal from the manager dashboard.</p> : (
        <>
          <section className="panel">
            <h3>Leftover food per meal (kg)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} unit=" kg" /><Tooltip /><Bar dataKey="leftoverKg" name="Leftover kg" fill="#2f6b3a" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </section>
          <section className="panel">
            <h3>Students unserved per meal (should stay at 0)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Bar dataKey="unservedCount" name="Unserved" fill="#b23a2b" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </section>
        </>
      )}
      <p className="hint">Food saved = usual kg cooked (from the mess manager) minus kg MessWise recommended. LPG = food saved × LPG per kg cooked (mess manager's figure). Both are estimates; leftover kg is weighed.</p>
    </div>
  );
}
