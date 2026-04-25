# Meal Planner

A simple **weekly meal planner** in the browser: build a **meal library** with ingredients, drag meals onto the week, and get an **automatic shopping list**. Built with plain **HTML, CSS, and JavaScript** (no build step).

- **Weekdays:** dinner slots only  
- **Weekends:** lunch + dinner  
- **First visit:** if [`meals.csv`](meals.csv) is present next to the app (e.g. on GitHub Pages), that **default meal library** loads automatically and the setup wizard is skipped. Otherwise the wizard walks you through adding meals.  
- **Data:** your plan and edits are stored in **localStorage** on that device only (not sent to a server)

## Features

- Meal library with variants, sides, and comma-separated ingredients  
- Weekly planner + shopping list (with checkboxes)  
- Lightweight recipes notebook with categories such as meals, toddler snacks, baking and sides  
- **Share** / **Import** for the full plan (link, QR, or JSON file)  
- **Import / export meals** as CSV; **export plan** as CSV  

## Recipes

Recipes are stored locally in your browser as small JSON records. They are useful for saving links, ingredients, instructions and comments without making every recipe part of the weekly meal plan.

- Use **Recipes → Add Recipe** to copy an extraction prompt for ChatGPT/Claude.
- Paste an Instagram link, web link, screenshot or rough recipe notes into ChatGPT/Claude with that prompt.
- Paste the returned JSON into the app and save it.
- Meal-type recipes can be copied into the normal **Meal Library** using **Copy to meal list**.
- Toddler snacks, bakes and sides stay recipe-only by default, so things like spinach and cheese muffins or banana bread do not clutter the weekly planner.

The app includes a small `recipes.example.json` fixture. On a new device/browser, it loads only when no recipes are already saved.

## Default meals (`meals.csv`)

Commit a **`meals.csv`** in the repo root (same folder as `index.html`). The app **fetches it only when the meal library is empty** (new visitor or cleared storage), then saves a copy into `localStorage`. Update the CSV in git and redeploy to change the defaults for new users; existing users keep their saved library until they clear site data or re-import.

Use **Export meals CSV** in the app to regenerate the file after editing meals in the UI.

**Note:** `fetch` needs a real URL. Opening `index.html` as `file://` often **cannot** load `meals.csv`; use a local server (below) or GitHub Pages.

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

Your **weekly plan** and saved **recipes** live in the visitor’s browser only. The **default** meal list and example recipes are whatever you commit as `meals.csv` and `recipes.example.json` in this repo (public if the repo is public). Sharing a **Share** link or file sends that plan/recipe snapshot to whoever you give it to.

## License

Add a `LICENSE` file if you want to specify how others may use the code (e.g. MIT).
