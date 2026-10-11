import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, fuelEstimate, showRateSample } from '../src/recommend.mjs';

const dishes = [{ name: 'Rice', gramsPerPortion: 125 }, { name: 'Dal', gramsPerPortion: 75 }, { name: 'Sabzi', gramsPerPortion: 100 }];

test('matches the worked example in the plan', () => {
  const r = recommend({ confirmed: 212, skipped: 28, registered: 300, showRate: 0.4, bufferPct: 5, dishes });
  assert.equal(r.noResponse, 60);
  assert.equal(r.portions, 248);
  assert.deepEqual(r.kgPerDish.map((d) => d.kg), [31.0, 18.6, 24.8]);
  assert.match(r.explanation, /212 confirmed \+ 60 no-response × 40% expected show rate = 236/);
});

test('no float noise in ceil', () => {
  const r = recommend({ confirmed: 200, skipped: 0, registered: 200, showRate: 0, bufferPct: 10, dishes });
  assert.equal(r.portions, 220);
});

test('over-registered check-ins never go negative', () => {
  const r = recommend({ confirmed: 120, skipped: 10, registered: 100, showRate: 0.5, bufferPct: 0, dishes });
  assert.equal(r.noResponse, 0);
  assert.equal(r.portions, 120);
});

test('fuel and show rate', () => {
  assert.deepEqual(fuelEstimate({ baselineKg: 90, cookedKg: 74.4, lpgPerKgCooked: 0.05 }), { foodSavedKg: 15.6, lpgSavedKg: 0.78 });
  assert.equal(showRateSample({ portionsServed: 230, confirmed: 212, noResponse: 60 }), 0.3);
  assert.equal(showRateSample({ portionsServed: 100, confirmed: 100, noResponse: 0 }), null);
});
