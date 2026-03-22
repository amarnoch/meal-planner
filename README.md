# Meal Planner

A simple **weekly meal planner** in the browser: build a **meal library** with ingredients, drag meals onto the week, and get an **automatic shopping list**. Built with plain **HTML, CSS, and JavaScript** (no build step).

- **Weekdays:** dinner slots only  
- **Weekends:** lunch + dinner  
- **First visit:** a short wizard helps you add meals and an initial plan  
- **Data:** everything is stored in **localStorage** on that device only (not sent to a server)

## Features

- Meal library with variants, sides, and comma-separated ingredients  
- Weekly planner + shopping list (with checkboxes)  
- **Share** / **Import** for the full plan (link, QR, or JSON file)  
- **Import / export meals** as CSV; **export plan** as CSV  

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

Plans and meals live in **the visitor’s browser** only. Sharing a **Share** link or file sends that snapshot to whoever you give it to; the GitHub repo does not store your personal meal data.

## License

Add a `LICENSE` file if you want to specify how others may use the code (e.g. MIT).
