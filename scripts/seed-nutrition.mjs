/**
 * Seed per-serving nutrition into the repo data files.
 *
 * Source: scripts/nutrition-seed.json — per-serving { kcal, protein, carbs,
 * sugar, fat, satFat, fibre, salt, basis } keyed by meal_name (meals) and
 * recipe id (recipes). Estimated then double-checked; 14 recipes use the
 * publishers' stated panels (basis "scraped"); granola is logged "as eaten"
 * (granola + 150g 0% yoghurt + fruit, basis "stated").
 *
 * Patches public/recipes.json (adds `nutrition` per recipe) and
 * public/meals.csv (adds a `nutrition_json` column). Idempotent — re-running
 * refreshes the values. Run: node scripts/seed-nutrition.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const seed = JSON.parse(fs.readFileSync(path.join(here, 'nutrition-seed.json'), 'utf8'));

function escapeCsv(s) {
  if (s == null) return '';
  s = String(s);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// First CSV field of a raw line (handles a leading quoted field).
function firstField(line) {
  if (line[0] === '"') {
    let s = '', i = 1;
    while (i < line.length) {
      if (line[i] === '"') { if (line[i + 1] === '"') { s += '"'; i += 2; } else break; }
      else { s += line[i]; i++; }
    }
    return s;
  }
  return line.slice(0, line.indexOf(',') === -1 ? line.length : line.indexOf(','));
}

// --- recipes.json ---
const recipesPath = path.join(repo, 'public', 'recipes.json');
const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8'));
const recipeArr = Array.isArray(recipes) ? recipes : [recipes];
const seedRecipeIds = new Set(Object.keys(seed.recipes));
let recipeHits = 0;
const recipeMisses = [];
for (const r of recipeArr) {
  const n = seed.recipes[r.id];
  if (n) { r.nutrition = { ...n }; recipeHits++; seedRecipeIds.delete(r.id); }
  else recipeMisses.push(r.id);
}
fs.writeFileSync(recipesPath, JSON.stringify(recipeArr, null, 2) + '\n');

// --- meals.csv ---
const csvPath = path.join(repo, 'public', 'meals.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const header = lines[0];
const hasCol = header.split(',').includes('nutrition_json');
const out = [hasCol ? header : header + ',nutrition_json'];
const seedMealNames = new Set(Object.keys(seed.meals));
let mealHits = 0;
const mealMisses = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) { out.push(line); continue; }
  const name = firstField(line).trim();
  const n = seed.meals[name];
  const cell = n ? escapeCsv(JSON.stringify(n)) : '';
  if (n) { mealHits++; seedMealNames.delete(name); } else mealMisses.push(name);
  // If the column already exists, replace the last field; else append.
  out.push(hasCol ? line.replace(/,[^,]*$/, ',' + cell) : line + ',' + cell);
}
fs.writeFileSync(csvPath, out.join('\n'));

console.log(`recipes.json: ${recipeHits}/${recipeArr.length} got nutrition`);
if (recipeMisses.length) console.log('  recipes WITHOUT seed nutrition:', recipeMisses.join(', '));
if (seedRecipeIds.size) console.log('  seed recipe ids NOT in recipes.json:', [...seedRecipeIds].join(', '));
console.log(`meals.csv: ${mealHits}/${lines.filter((l, i) => i > 0 && l.trim()).length} rows got nutrition`);
if (mealMisses.length) console.log('  meals WITHOUT seed nutrition:', mealMisses.join(' | '));
if (seedMealNames.size) console.log('  seed meal names NOT in meals.csv:', [...seedMealNames].join(' | '));
