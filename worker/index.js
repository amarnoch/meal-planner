/**
 * The Marnoch Pantry — Cloudflare Worker
 * Serves the static app (assets binding) plus:
 *   /api/doc/:name   GET/PUT shared JSON docs (meals, recipes, plan, settings) with optimistic versioning
 *   /api/push        POST subscribe / DELETE unsubscribe
 *   /api/vapid       GET the public key for pushManager.subscribe
 *   /api/notify-test POST a test notification to every device
 * Hourly cron sends "today's meal + prep" once per day at the household's chosen time.
 */

import { sendWebPush } from './push.js';

const DOC_NAMES = ['meals', 'recipes', 'plan', 'settings'];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function unauthorized() {
  return json({ error: 'unauthorized' }, 401);
}

function isAuthed(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.replace(/^Bearer\s+/i, '').trim();
  return !!env.FAMILY_KEY && key === env.FAMILY_KEY;
}

async function getDoc(env, name) {
  const raw = await env.PANTRY.get(`doc:${name}`);
  if (!raw) return { version: 0, updatedAt: null, data: null };
  return JSON.parse(raw);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/vapid' && request.method === 'GET') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null });
  }

  if (!isAuthed(request, env)) return unauthorized();

  const docMatch = path.match(/^\/api\/doc\/([a-z]+)$/);
  if (docMatch) {
    const name = docMatch[1];
    if (!DOC_NAMES.includes(name)) return json({ error: 'unknown doc' }, 404);

    if (request.method === 'GET') {
      return json(await getDoc(env, name));
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body || body.data === undefined) return json({ error: 'body must be {baseVersion, data}' }, 400);
      const current = await getDoc(env, name);
      const baseVersion = Number(body.baseVersion || 0);
      if (current.version !== baseVersion) {
        // Conflict: hand back the latest so the client can merge and retry.
        return json({ error: 'conflict', current }, 409);
      }
      const next = { version: current.version + 1, updatedAt: new Date().toISOString(), data: body.data };
      await env.PANTRY.put(`doc:${name}`, JSON.stringify(next));
      return json({ version: next.version, updatedAt: next.updatedAt });
    }
    return json({ error: 'method not allowed' }, 405);
  }

  if (path === '/api/push') {
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const sub = body && body.subscription;
      if (!sub || !sub.endpoint || !sub.keys) return json({ error: 'missing subscription' }, 400);
      const deviceId = String(body.deviceId || '').slice(0, 64) || 'unknown';
      await env.PANTRY.put(`push:${deviceId}`, JSON.stringify({ subscription: sub, label: String(body.label || '').slice(0, 40), savedAt: new Date().toISOString() }));
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => null);
      const deviceId = String((body && body.deviceId) || '');
      if (deviceId) await env.PANTRY.delete(`push:${deviceId}`);
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  }

  if (path === '/api/notify-test' && request.method === 'POST') {
    const result = await sendDailyNotification(env, { force: true, title: 'The Marnoch Pantry', testNote: 'Test notification — you are all set up. 🎉' });
    return json(result);
  }

  return json({ error: 'not found' }, 404);
}

// --- Daily notification ---

function londonNow() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long'
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour === '24' ? 0 : parts.hour),
    weekday: parts.weekday
  };
}

const LEFTOVERS = '__leftovers__';

function describeSlot(planData, dateKey, mealType) {
  if (!planData || !planData.plan) return null;
  const key = `${dateKey}|${mealType}`;
  const name = planData.plan[key];
  if (!name) return null;
  const variant = (planData.planVariants || {})[key];
  const side = (planData.planSides || {})[key];
  if (name === LEFTOVERS) return variant ? `Leftovers (${variant})` : 'Leftovers';
  let label = variant ? `${name} (${variant})` : name;
  if (side && side !== '__none__') label += ` with ${side}`;
  return label;
}

function ingredientsForMeal(mealsData, recipesData, mealName) {
  if (!mealName || mealName === LEFTOVERS) return [];
  const meals = (mealsData && mealsData.meals) || [];
  const meal = meals.find(m => m.meal_name === mealName);
  if (!meal) return [];
  if (meal.ingredients && meal.ingredients.length) return meal.ingredients;
  return meal.commonIngredients || [];
}

const PREP_KEYWORDS = ['mince', 'chicken', 'beef', 'pork', 'lamb', 'salmon', 'fish', 'prawn', 'sausage', 'steak', 'turkey'];

function buildDailyMessage(planData, mealsData, recipesData, dateKey, weekday) {
  const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';
  const slots = isWeekend ? ['Lunch', 'Dinner'] : ['Dinner'];
  const lines = [];
  let anyMeal = false;
  for (const slot of slots) {
    const label = describeSlot(planData, dateKey, slot);
    if (!label) continue;
    anyMeal = true;
    lines.push(slots.length > 1 ? `${slot}: ${label}` : `Tonight: ${label}`);
    const rawName = (planData.plan || {})[`${dateKey}|${slot}`];
    const ings = ingredientsForMeal(mealsData, recipesData, rawName);
    const prep = ings.filter(i => PREP_KEYWORDS.some(k => String(i).toLowerCase().includes(k)));
    if (prep.length) lines.push(`Prep: ${prep.slice(0, 3).join(', ')} — out of the freezer?`);
  }
  if (!anyMeal) return null;
  return { title: `${weekday}'s plan 🍽`, body: lines.join('\n') };
}

async function sendDailyNotification(env, opts = {}) {
  const { date, weekday } = londonNow();
  const [planDoc, mealsDoc, recipesDoc] = await Promise.all([
    getDoc(env, 'plan'), getDoc(env, 'meals'), getDoc(env, 'recipes')
  ]);
  let message;
  if (opts.testNote) {
    message = { title: opts.title || 'The Marnoch Pantry', body: opts.testNote };
  } else {
    message = buildDailyMessage(planDoc.data, mealsDoc.data, recipesDoc.data, date, weekday);
  }
  if (!message) return { sent: 0, reason: 'nothing planned today' };

  const list = await env.PANTRY.list({ prefix: 'push:' });
  let sent = 0, pruned = 0;
  for (const key of list.keys) {
    const raw = await env.PANTRY.get(key.name);
    if (!raw) continue;
    const { subscription } = JSON.parse(raw);
    try {
      const status = await sendWebPush(subscription, JSON.stringify(message), env);
      if (status === 404 || status === 410) {
        await env.PANTRY.delete(key.name);
        pruned++;
      } else if (status >= 200 && status < 300) {
        sent++;
      }
    } catch (_) { /* one bad endpoint shouldn't block the rest */ }
  }
  return { sent, pruned, devices: list.keys.length };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const { date, hour } = londonNow();
      const settingsDoc = await getDoc(env, 'settings');
      const notifyHour = Number(((settingsDoc.data || {}).notifyTime || '08:00').split(':')[0]);
      if (hour !== notifyHour) return;
      const already = await env.PANTRY.get('lastNotifiedDate');
      if (already === date) return;
      await env.PANTRY.put('lastNotifiedDate', date);
      await sendDailyNotification(env);
    })());
  }
};
