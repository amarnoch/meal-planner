# The Marnoch Pantry (v2)

A family **meal planner** PWA: shared meal/recipe library, a date-based plan (7 / 10 / 14 days), automatic Morrisons-ordered shopping list, **cross-device sync**, and **daily push notifications** — all free, hosted on Cloudflare.

Plain **HTML, CSS, and JavaScript** (ES modules, no build step) + one **Cloudflare Worker** (`worker/`) for the API, sync storage (KV), and the notification cron.

## What's new in v2

- **Sync between phones** — meals, recipes, plan, shopping ticks and settings share via a "family key" (Settings ⚙). No accounts.
- **Add recipes in the app** — Recipes → **+ Add recipe**. Either partner can add/edit; it syncs everywhere. No more git commits to add a recipe.
- **7 / 10 / 14-day plans** — Settings → Plan length. Slots are keyed by real dates; "Today" is highlighted.
- **Leftovers** — pick "Leftovers" for any slot, or tap a planned meal → "🍲 Use leftovers instead". Excluded from the shopping list.
- **Daily reminder** — push notification each morning with the day's meal(s) and defrost-type prep. Needs the app added to the iPhone Home Screen (iOS 16.4+), then Settings → Enable reminders.
- **Configurable rules** — quick-meal days, salmon/week, meat-free days, weekend-only big meals, carb-repeat avoidance: all in Settings instead of hardcoded.
- **New look** — clean white Mob-style refresh; bug fixed where the Recipes tab couldn't get you back from an open recipe.

## Repo layout

```
public/    the app (deployed as static assets)
worker/    Cloudflare Worker: /api/* + daily notification cron + web push
scripts/   generate-vapid-keys.mjs (one-off)
wrangler.toml
```

## Run locally

```bash
npx wrangler dev          # app + API + local KV on http://localhost:8788
# put FAMILY_KEY=somekey in .dev.vars (gitignored) for local sync testing
```

## One-time Cloudflare setup

1. Create a free account at dash.cloudflare.com (no card needed).
2. `npx wrangler login`
3. `npx wrangler kv namespace create PANTRY` → paste the printed id into `wrangler.toml` (`id = "..."`).
4. Secrets:
   ```bash
   npx wrangler secret put FAMILY_KEY          # invent a long random phrase
   node scripts/generate-vapid-keys.mjs        # prints the two VAPID values
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
5. `npx wrangler deploy` → app live at `https://marnoch-pantry.<account>.workers.dev`
6. On each phone: open the URL → Share → **Add to Home Screen** → open the app → Settings ⚙ → enter the family key → **Enable reminders**.

Day-to-day deploys: `npx wrangler deploy` after changes (or connect the repo in the Cloudflare dashboard via Workers Builds for deploy-on-push).

## Rollback

The pre-v2 app is tagged **`v1`** (GitHub Pages version): `git checkout v1`.

## Data & privacy

Shared data (meals, recipes, plan, settings) lives in Cloudflare KV, readable/writable only with the family key. Each device keeps a localStorage copy and works offline; changes sync when back online. `public/recipes.json` and `public/meals.csv` remain as seed/backup data.
