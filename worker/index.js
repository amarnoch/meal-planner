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

async function scrapeRecipe(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MarnochPantry/2.0)',
      'Accept': 'text/html'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Site returned ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
    throw new Error('Not an HTML page');
  }
  const html = await res.text();
  if (html.length > 2_000_000) throw new Error('Page too large');

  // Try JSON-LD first
  const recipe = extractJsonLdRecipe(html);
  if (recipe) {
    return {
      title: recipe.name || '',
      ingredients: normaliseIngredients(recipe.recipeIngredient),
      steps: normaliseSteps(recipe.recipeInstructions),
      imageUrl: normaliseImage(recipe.image),
      servings: normaliseServings(recipe.recipeYield),
      nutrition: normaliseLdNutrition(recipe.nutrition),
      sourceUrl: recipe.url || targetUrl,
      partial: false
    };
  }

  // Fallback: OpenGraph / meta tags
  const title = extractMeta(html, 'og:title') || extractTitle(html) || '';
  const imageUrl = extractMeta(html, 'og:image') || null;
  return { title, ingredients: [], steps: [], imageUrl, servings: null, sourceUrl: targetUrl, partial: true };
}

function extractJsonLdRecipe(html) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const found = findRecipeInLd(parsed);
      if (found) return found;
    } catch (_) {}
  }
  return null;
}

function findRecipeInLd(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findRecipeInLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj !== 'object') return null;
  const type = obj['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj;
  if (obj['@graph']) return findRecipeInLd(obj['@graph']);
  return null;
}

function normaliseIngredients(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) return raw.map(i => typeof i === 'string' ? i.trim() : (i.text || String(i))).filter(Boolean);
  return [];
}

function normaliseSteps(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) {
    const steps = [];
    for (const item of raw) {
      if (typeof item === 'string') { steps.push(item.trim()); continue; }
      if (item && item['@type'] === 'HowToStep') { steps.push((item.text || '').trim()); continue; }
      if (item && item['@type'] === 'HowToSection') {
        const inner = item.itemListElement || [];
        for (const sub of inner) {
          if (typeof sub === 'string') steps.push(sub.trim());
          else if (sub.text) steps.push(sub.text.trim());
        }
      }
    }
    return steps.filter(Boolean);
  }
  return [];
}

function normaliseImage(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : (raw[0] && raw[0].url) || null;
  if (raw.url) return raw.url;
  return null;
}

function normaliseServings(raw) {
  if (!raw) return null;
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  const m = String(str).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// schema.org NutritionInformation is per serving. Pull the figures we track and
// convert sodium → salt (salt_g = sodium × 2.5). Strings like "23 g" / "520 mg".
function parseNutritionNumber(v) {
  if (v == null) return null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function normaliseLdNutrition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const round1 = (n) => Math.round(n * 10) / 10;
  const kcal = parseNutritionNumber(raw.calories);
  if (kcal != null) out.kcal = Math.round(kcal);
  const map = {
    protein: raw.proteinContent,
    carbs: raw.carbohydrateContent,
    sugar: raw.sugarContent,
    fat: raw.fatContent,
    satFat: raw.saturatedFatContent,
    fibre: raw.fiberContent != null ? raw.fiberContent : raw.fibreContent
  };
  for (const [k, v] of Object.entries(map)) {
    const n = parseNutritionNumber(v);
    if (n != null) out[k] = round1(n);
  }
  const sodium = parseNutritionNumber(raw.sodiumContent);
  if (sodium != null) {
    const grams = /\bmg\b|milligram/i.test(String(raw.sodiumContent)) ? sodium / 1000 : sodium;
    out.salt = round1(grams * 2.5);
  }
  return Object.keys(out).length ? { ...out, basis: 'scraped' } : null;
}

function extractMeta(html, property) {
  const re = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
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

  if (path === '/api/scrape-recipe' && request.method === 'GET') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) return json({ error: 'url parameter required' }, 400);
    try { new URL(targetUrl); } catch (_) { return json({ error: 'invalid URL' }, 400); }
    try {
      const result = await scrapeRecipe(targetUrl);
      return json(result);
    } catch (err) {
      return json({ error: err.message || 'Failed to fetch recipe' }, 502);
    }
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
      const notifyTime = (settingsDoc.data || {}).notifyTime || '08:00';
      const notifyHour = Number(notifyTime.split(':')[0]);
      if (hour !== notifyHour) return;
      // Dedupe on day + chosen time so (a) an empty/no-op run never "uses up"
      // the day, and (b) changing the notify time re-arms it the same day.
      const stamp = `${date}|${notifyTime}`;
      if (await env.PANTRY.get('lastNotified') === stamp) return;
      const result = await sendDailyNotification(env);
      if (result && result.sent > 0) await env.PANTRY.put('lastNotified', stamp);
    })());
  }
};
