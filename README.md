# Meal Planner

A simple **weekly meal planner** in the browser: build a **meal library** with ingredients, drag meals onto the week, and get an **automatic shopping list**. Built with plain **HTML, CSS, and JavaScript** (no build step).

- **Weekdays:** dinner slots only  
- **Weekends:** lunch + dinner  
- **First visit:** if [`meals.csv`](meals.csv) is present next to the app (e.g. on GitHub Pages), that **default meal library** loads automatically and the setup wizard is skipped. Otherwise the wizard walks you through adding meals.  
- **Data:** your plan and edits are stored in **localStorage** on that device only (not sent to a server)

## Features

- Meal library with variants, sides, and comma-separated ingredients  
- Weekly planner + shopping list (with checkboxes)  
- **Shared recipe library** via committed [`recipes.json`](recipes.json) (loaded on every visit when the file is available — ideal for a household after GitHub Pages redeploys)  
- **Share** / **Import** for the full plan (link, QR, or JSON file)  
- **Import / export meals** as CSV; **export plan** as CSV  

## Recipes (batch library + device backup)

The **canonical recipe list** for everyone using the deployed app lives in **`recipes.json`** in this repo. After you push, GitHub Pages serves the new file and all visitors get the same library on refresh.

- **Extract recipe** (in the app): step through **Source → Extract → Validate**. Build a prompt for Claude or ChatGPT, copy model output, and use **Validate JSON** to check it before you commit.  
- **Copy prompt & open Claude** copies the prompt and opens a new chat; you can also use **Open Claude** / **Open ChatGPT** links.  
- **Paste from clipboard** (validate step) helps on mobile when the model returns JSON.  
- The parser accepts a bare object, an array, or JSON wrapped in fenced code blocks from chat tools (markdown-style fences are stripped).  
- **Export backup** downloads a JSON snapshot of whatever is on **this device** (merged library + local drafts + your notes).  
- **Import backup file** merges that snapshot into this browser only — it does **not** update the shared repo.  
- Meal-type recipes can still be copied into the **Meal Library** from a recipe card.  
- Per-recipe **comments** and “in meal list” state stay on the device when they differ from the file (same `id` = your local notes overlay the shared record).

### Batch workflow (add a recipe for everyone)

1. On phone or desktop, open the app → **Recipes** → **Extract recipe** and complete the steps.  
2. In Claude or ChatGPT, paste the prompt plus your link or screenshot; copy the JSON it returns.  
3. On a laptop (or GitHub’s web editor), append the object to the **`recipes.json`** array (or add a new object if it’s a single recipe).  
4. Validate syntax, e.g. `python3 -m json.tool recipes.json > /tmp/out.json && mv /tmp/out.json recipes.json`  
5. `git add recipes.json && git commit -m "Add recipe" && git push`  
6. Wait for GitHub Pages to redeploy, then refresh the app — you and anyone else using the site see the new recipes.

If **`recipes.json` fails to load** (offline, opening as `file://`, or file missing), the app keeps using the last **localStorage** copy from the previous successful load, including any **local-only drafts** (recipes with ids not in the file).

## Default meals (`meals.csv`)

Commit a **`meals.csv`** in the repo root (same folder as `index.html`). The app **fetches it only when the meal library is empty** (new visitor or cleared storage), then saves a copy into `localStorage`. Update the CSV in git and redeploy to change the defaults for new users; existing users keep their saved library until they clear site data or re-import.

Use **Export meals CSV** in the app to regenerate the file after editing meals in the UI.

**Note:** `fetch` needs a real URL. Opening `index.html` as `file://` often **cannot** load `meals.csv` or `recipes.json`; use a local server (below) or GitHub Pages.

## Run locally

Open `index.html` in a browser, or serve the folder so all assets load reliably:

```bash
cd /path/to/meal-planner
python3 -m http.server 8080
# visit http://localhost:8080
```

## Deploy (GitHub Pages)

If this repo is **`your-username/meal-planner`** and Pages is enabled on the **`main`** branch from the **root** (`/`), the app is usually available at:

**`https://your-username.github.io/meal-planner/`**

Enable it in the repo: **Settings → Pages → Build and deployment → Branch: `main` / folder: `/`**.

## Sharing your **public GitHub repo**

Once the repo is **public** on your personal account, anyone can use it with the normal GitHub URL:

| What to share | URL pattern |
|---------------|-------------|
| Repo (code, README, stars) | `https://github.com/<your-username>/meal-planner` |
| Clone (HTTPS) | `https://github.com/<your-username>/meal-planner.git` |
| Live app (if Pages is on) | `https://<your-username>.github.io/meal-planner/` |

**Practical tips:**

1. **Copy the URL** from the browser when you’re on the repo’s main page — that’s the link to share for “here’s the project.”  
2. **README** (this file) is what people see first on GitHub; keep it updated.  
3. **Description & website:** Repo **Settings → General** — set a short description and optionally **Website** to your GitHub Pages URL.  
4. **Topics:** On the repo main page, click **⚙️** next to “About” and add tags like `meal-planner`, `javascript`, `static-site` so others can discover it.  
5. **Stars / forks:** On a public repo, **Star** and **Fork** are visible to everyone; you don’t need to do anything extra for “sharing” beyond making the repo public (which you already did).

## Privacy note

Your **weekly plan** and **device-specific recipe notes / backups** live in the visitor’s browser. The **default meal list** and **shared recipes** are whatever you commit as `meals.csv` and `recipes.json` (public if the repo is public). Sharing a **Share** link or file sends that plan snapshot to whoever you give it to.

## License

Add a `LICENSE` file if you want to specify how others may use the code (e.g. MIT).
