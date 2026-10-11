// Optional: adds a few SAMPLE meals (flagged sample:true, shown with * and a banner).
// Usage: node scripts/seed.mjs <API_URL> <MANAGER_KEY>
const [API, KEY] = process.argv.slice(2);
if (!API || !KEY) { console.error('Usage: node scripts/seed.mjs <API_URL> <MANAGER_KEY>'); process.exit(1); }
const h = { 'content-type': 'application/json', 'x-manager-key': KEY };
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const dishes = [{ name: 'Rice', gramsPerPortion: 125 }, { name: 'Dal', gramsPerPortion: 75 }, { name: 'Sabzi', gramsPerPortion: 100 }];
const meals = [
  { d: 3, t: 'LUNCH', served: 41, left: 6.5 }, { d: 3, t: 'DINNER', served: 38, left: 7.2 },
  { d: 2, t: 'LUNCH', served: 44, left: 5.1 }, { d: 2, t: 'DINNER', served: 36, left: 6.8 },
];
for (const m of meals) {
  const date = day(m.d);
  const body = { date, mealType: m.t, cutoffAt: `${date}T${m.t === 'LUNCH' ? '11:00' : '18:30'}:00+05:30`, bufferPct: 5,
    registeredStudents: 50, coldStartShowRate: 0.4, baselineKg: 20, lpgPerKgCooked: 0.05, dishes, sample: true };
  let r = await fetch(`${API}/meals`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  console.log('create', date, m.t, r.status);
  r = await fetch(`${API}/meals/${date}_${m.t}/outcome`, { method: 'POST', headers: h, body: JSON.stringify({ portionsServed: m.served, leftoverKg: m.left, unservedCount: 0 }) });
  console.log('outcome', date, m.t, r.status);
}
