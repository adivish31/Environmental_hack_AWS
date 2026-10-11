// Pure functions. No AWS calls here, so they are easy to unit test.
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

export function recommend({ confirmed, skipped, registered, showRate, bufferPct, dishes }) {
  const noResponse = Math.max(0, registered - confirmed - skipped);
  const expectedRaw = confirmed + noResponse * showRate;
  // toFixed guards against float noise like 220.00000000000003 -> 221
  const portions = Math.ceil(Number((expectedRaw * (1 + bufferPct / 100)).toFixed(6)));
  const kgPerDish = dishes.map((d) => ({ name: d.name, kg: round1((portions * d.gramsPerPortion) / 1000) }));
  const cookedKg = round1(kgPerDish.reduce((s, d) => s + d.kg, 0));
  const explanation =
    `${confirmed} confirmed + ${noResponse} no-response × ${Math.round(showRate * 100)}% expected show rate = ${Math.round(expectedRaw)}. ` +
    `With a ${bufferPct}% buffer: ${portions} portions. ` +
    kgPerDish.map((d) => `${d.name} ${d.kg.toFixed(1)} kg`).join(', ') + '.';
  return { confirmed, skipped, noResponse, expected: round2(expectedRaw), portions, kgPerDish, cookedKg, explanation };
}

export function fuelEstimate({ baselineKg, cookedKg, lpgPerKgCooked }) {
  const foodSavedKg = Math.max(0, round1(baselineKg - cookedKg));
  return { foodSavedKg, lpgSavedKg: round2(foodSavedKg * lpgPerKgCooked) };
}

// Share of no-response students who actually ate, from one logged meal.
export function showRateSample({ portionsServed, confirmed, noResponse }) {
  if (noResponse <= 0) return null;
  return Math.min(1, Math.max(0, portionsServed - confirmed) / noResponse);
}

export function weekdayOf(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
}
