import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { recommend, fuelEstimate, showRateSample, weekdayOf } from './recommend.mjs';

const TABLE = process.env.TABLE_NAME;
const MANAGER_KEY = process.env.MANAGER_KEY;
const MESS_ID = process.env.MESS_ID || 'bitmesra';
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const ORDER = { BREAKFAST: 1, LUNCH: 2, DINNER: 3 };
const MIN_SAMPLES = 3;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

class HttpError extends Error { constructor(code, msg) { super(msg); this.statusCode = code; this.expose = true; } }
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, name, min = 0, max = 100000) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  }
  return n;
};

async function queryAll(params) {
  const items = []; let key;
  do {
    const r = await ddb.send(new QueryCommand({ ...params, ExclusiveStartKey: key }));
    items.push(...(r.Items || [])); key = r.LastEvaluatedKey;
  } while (key);
  return items;
}

async function getMeal(mealId) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: `MEAL#${mealId}`, SK: 'META' } }));
  if (!r.Item) throw new HttpError(404, 'Meal not found');
  return r.Item;
}

async function countCheckins(mealId) {
  const items = await queryAll({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :c)',
    ExpressionAttributeValues: { ':pk': `MEAL#${mealId}`, ':c': 'CHECKIN#' },
  });
  return { confirmed: items.filter((i) => i.status === 'IN').length, skipped: items.filter((i) => i.status === 'OUT').length };
}

async function getShowRate(meal) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: `STATS#${MESS_ID}`, SK: `SHOWRATE#${meal.mealType}#${weekdayOf(meal.date)}` } }));
  if (r.Item && r.Item.samples >= MIN_SAMPLES) return { showRate: r.Item.avgShowRate, showRateSource: 'learned', samples: r.Item.samples };
  return { showRate: meal.coldStartShowRate, showRateSource: 'assumption', samples: r.Item?.samples || 0 };
}

async function liveRec(meal) {
  const counts = await countCheckins(meal.mealId);
  const sr = await getShowRate(meal);
  const rec = recommend({ ...counts, registered: meal.registeredStudents, showRate: sr.showRate, bufferPct: meal.bufferPct, dishes: meal.dishes });
  return { ...rec, showRate: sr.showRate, showRateSource: sr.showRateSource, showRateSamples: sr.samples, bufferPct: meal.bufferPct };
}

// Freeze the final number. Runs on the first request after cutoff (lazy lock),
// so the lock holds even with no scheduler.
async function lockMeal(meal) {
  const rec = await liveRec(meal);
  try {
    const r = await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { PK: meal.PK, SK: 'META' },
      UpdateExpression: 'SET #s = :locked, finalRec = :rec, lockedAt = :now',
      ConditionExpression: '#s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':locked': 'LOCKED', ':open': 'OPEN', ':rec': rec, ':now': new Date().toISOString() },
      ReturnValues: 'ALL_NEW',
    }));
    return r.Attributes;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return getMeal(meal.mealId);
    throw e;
  }
}

const pastCutoff = (meal) => Date.now() >= Date.parse(meal.cutoffAt);
async function ensureLock(meal) { return meal.status === 'OPEN' && pastCutoff(meal) ? lockMeal(meal) : meal; }

const publicMeal = (m) => ({
  mealId: m.mealId, date: m.date, mealType: m.mealType, cutoffAt: m.cutoffAt, status: m.status,
  bufferPct: m.bufferPct, dishes: m.dishes, sample: !!m.sample, registeredStudents: m.registeredStudents,
});

function requireManager(isManager) { if (!isManager) throw new HttpError(401, 'Manager passcode required'); }

export const handler = async (event) => {
  try {
    const route = event.routeKey;
    const q = event.queryStringParameters || {};
    const p = event.pathParameters || {};
    const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : '{}';
    let body; try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const isManager = !!MANAGER_KEY && (event.headers?.['x-manager-key'] || '') === MANAGER_KEY;

    switch (route) {
      case 'GET /auth':
        requireManager(isManager);
        return json(200, { ok: true });

      case 'GET /meals': {
        if (!DATE_RE.test(q.date || '')) throw new HttpError(400, 'date=YYYY-MM-DD required');
        const items = await queryAll({
          TableName: TABLE, IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :d)',
          ExpressionAttributeValues: { ':pk': `MESS#${MESS_ID}`, ':d': q.date },
        });
        const meals = [];
        for (const it of items) {
          const m = await ensureLock(it);
          const out = publicMeal(m);
          if (q.roll) {
            const c = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: m.PK, SK: `CHECKIN#${String(q.roll).trim().toUpperCase()}` } }));
            out.myStatus = c.Item?.status || null;
          }
          meals.push(out);
        }
        meals.sort((a, b) => ORDER[a.mealType] - ORDER[b.mealType]);
        return json(200, { meals });
      }

      case 'POST /meals': {
        requireManager(isManager);
        const { date, mealType, cutoffAt } = body;
        if (!DATE_RE.test(date || '')) throw new HttpError(400, 'date must be YYYY-MM-DD');
        if (!MEAL_TYPES.includes(mealType)) throw new HttpError(400, 'mealType must be BREAKFAST, LUNCH or DINNER');
        if (!cutoffAt || Number.isNaN(Date.parse(cutoffAt))) throw new HttpError(400, 'cutoffAt must be an ISO time');
        const dishes = (body.dishes || []).map((d) => ({ name: String(d.name || '').trim().slice(0, 40), gramsPerPortion: num(d.gramsPerPortion, 'gramsPerPortion', 1, 2000) }));
        if (!dishes.length || dishes.some((d) => !d.name)) throw new HttpError(400, 'Add at least one dish with a name');
        const mealId = `${date}_${mealType}`;
        const item = {
          PK: `MEAL#${mealId}`, SK: 'META', GSI1PK: `MESS#${MESS_ID}`, GSI1SK: `${date}#${ORDER[mealType]}${mealType}`,
          mealId, messId: MESS_ID, date, mealType, cutoffAt: new Date(cutoffAt).toISOString(), status: 'OPEN',
          bufferPct: num(body.bufferPct ?? 5, 'bufferPct', 0, 50),
          registeredStudents: num(body.registeredStudents, 'registeredStudents', 1, 5000),
          coldStartShowRate: num(body.coldStartShowRate ?? 0.4, 'coldStartShowRate', 0, 1),
          baselineKg: num(body.baselineKg, 'baselineKg', 0, 10000),
          lpgPerKgCooked: num(body.lpgPerKgCooked ?? 0.05, 'lpgPerKgCooked', 0, 5),
          dishes, sample: !!body.sample, createdAt: new Date().toISOString(),
        };
        try {
          await ddb.send(new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: 'attribute_not_exists(PK)' }));
        } catch (e) {
          if (e.name === 'ConditionalCheckFailedException') throw new HttpError(409, 'This meal already exists');
          throw e;
        }
        return json(201, publicMeal(item));
      }

      case 'PATCH /meals/{mealId}': {
        requireManager(isManager);
        const meal = await ensureLock(await getMeal(p.mealId));
        if (meal.status !== 'OPEN') throw new HttpError(409, 'Meal is locked');
        const bufferPct = num(body.bufferPct, 'bufferPct', 0, 50);
        await ddb.send(new UpdateCommand({ TableName: TABLE, Key: { PK: meal.PK, SK: 'META' }, UpdateExpression: 'SET bufferPct = :b', ExpressionAttributeValues: { ':b': bufferPct } }));
        return json(200, { ...publicMeal(meal), bufferPct });
      }

      case 'PUT /meals/{mealId}/checkin': {
        const roll = String(body.roll || '').trim().toUpperCase();
        if (!/^[A-Z0-9/\-.]{2,24}$/.test(roll)) throw new HttpError(400, 'Enter a valid roll number');
        if (!['IN', 'OUT'].includes(body.status)) throw new HttpError(400, 'status must be IN or OUT');
        const meal = await ensureLock(await getMeal(p.mealId));
        if (meal.status !== 'OPEN') throw new HttpError(409, 'Check-in closed for this meal');
        await ddb.send(new PutCommand({ TableName: TABLE, Item: { PK: meal.PK, SK: `CHECKIN#${roll}`, roll, status: body.status, updatedAt: new Date().toISOString() } }));
        return json(200, { roll, status: body.status });
      }

      case 'GET /meals/{mealId}/recommendation': {
        const meal = await ensureLock(await getMeal(p.mealId));
        if (meal.status !== 'OPEN' && meal.finalRec) return json(200, { ...meal.finalRec, status: meal.status, outcome: meal.outcome || null });
        return json(200, { ...(await liveRec(meal)), status: meal.status });
      }

      case 'POST /meals/{mealId}/outcome': {
        requireManager(isManager);
        let meal = await getMeal(p.mealId);
        if (meal.status === 'CLOSED') throw new HttpError(409, 'Outcome already logged');
        if (meal.status === 'OPEN') meal = await lockMeal(meal); // logging early forces the lock
        const rec = meal.finalRec;
        const portionsServed = num(body.portionsServed, 'portionsServed', 0, 10000);
        const leftoverKg = num(body.leftoverKg, 'leftoverKg', 0, 10000);
        const unservedCount = num(body.unservedCount, 'unservedCount', 0, 10000);
        const fuel = fuelEstimate({ baselineKg: meal.baselineKg, cookedKg: rec.cookedKg, lpgPerKgCooked: meal.lpgPerKgCooked });
        const outcome = { portionsServed, leftoverKg, unservedCount, cookedKg: rec.cookedKg, baselineKg: meal.baselineKg, ...fuel, loggedAt: new Date().toISOString() };
        await ddb.send(new UpdateCommand({
          TableName: TABLE, Key: { PK: meal.PK, SK: 'META' },
          UpdateExpression: 'SET #s = :closed, outcome = :o', ConditionExpression: '#s = :locked',
          ExpressionAttributeNames: { '#s': 'status' }, ExpressionAttributeValues: { ':closed': 'CLOSED', ':locked': 'LOCKED', ':o': outcome },
        }));
        // Learn the show rate only from real (non-sample) meals.
        const s = showRateSample({ portionsServed, confirmed: rec.confirmed, noResponse: rec.noResponse });
        if (s !== null && !meal.sample) {
          const key = { PK: `STATS#${MESS_ID}`, SK: `SHOWRATE#${meal.mealType}#${weekdayOf(meal.date)}` };
          const cur = (await ddb.send(new GetCommand({ TableName: TABLE, Key: key }))).Item || { samples: 0, avgShowRate: 0 };
          const samples = cur.samples + 1;
          await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...key, samples, avgShowRate: (cur.avgShowRate * cur.samples + s) / samples } }));
        }
        const warning = unservedCount > 0 ? `${unservedCount} students went unserved. Raise the buffer for ${meal.mealType.toLowerCase()}.` : null;
        return json(200, { ...outcome, warning });
      }

      case 'GET /stats': {
        const today = new Date().toISOString().slice(0, 10);
        const from = DATE_RE.test(q.from || '') ? q.from : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const to = DATE_RE.test(q.to || '') ? q.to : new Date(Date.now() + 864e5).toISOString().slice(0, 10);
        const items = await queryAll({
          TableName: TABLE, IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :f AND :t',
          ExpressionAttributeValues: { ':pk': `MESS#${MESS_ID}`, ':f': `${from}#`, ':t': `${to}#~` },
        });
        void today;
        const meals = items.filter((m) => m.status === 'CLOSED' && m.outcome).map((m) => ({
          mealId: m.mealId, date: m.date, mealType: m.mealType, sample: !!m.sample,
          portions: m.finalRec?.portions, portionsServed: m.outcome.portionsServed, leftoverKg: m.outcome.leftoverKg,
          unservedCount: m.outcome.unservedCount, foodSavedKg: m.outcome.foodSavedKg, lpgSavedKg: m.outcome.lpgSavedKg,
        }));
        const sum = (k) => Math.round(meals.reduce((s, m) => s + (m[k] || 0), 0) * 100) / 100;
        return json(200, {
          meals, hasSample: meals.some((m) => m.sample),
          totals: { meals: meals.length, leftoverKg: sum('leftoverKg'), unservedCount: sum('unservedCount'), foodSavedKg: sum('foodSavedKg'), lpgSavedKg: sum('lpgSavedKg') },
        });
      }

      default:
        throw new HttpError(404, 'Route not found');
    }
  } catch (e) {
    if (!e.expose) console.error(e);
    return json(e.statusCode || 500, { error: e.expose ? e.message : 'Internal error' });
  }
};
