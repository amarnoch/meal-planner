/**
 * Meal Planner - vanilla JS app
 * State, wizard, planner, shopping list, CSV
 */

(function () {
  'use strict';

  const STORAGE_MEALS = 'mealPlanner_meals';
  const STORAGE_PLAN = 'mealPlanner_plan';
  const STORAGE_PLAN_VARIANTS = 'mealPlanner_planVariants';
  const STORAGE_PLAN_SIDES = 'mealPlanner_planSides';
  const STORAGE_SHOPPING_CHECKED = 'mealPlanner_shoppingChecked';
  const STORAGE_WIZARD_DONE = 'mealPlanner_wizardDone';
  const STORAGE_RECIPES = 'mealPlanner_recipes';

  /** Served next to index.html (e.g. GitHub Pages). Loaded when the meal library is empty. */
  const BUNDLED_MEALS_CSV = 'meals.csv';
  const BUNDLED_RECIPES_JSON = 'recipes.example.json';

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const DAY_ABBREV = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun'
  };

  function dayAbbrev(day) {
    return DAY_ABBREV[day] || day;
  }

  const RECIPE_CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'meal', label: 'Meals' },
    { id: 'toddler_snack', label: 'Toddler snacks' },
    { id: 'baking', label: 'Baking' },
    { id: 'side', label: 'Sides' },
    { id: 'other', label: 'Other' }
  ];

  const RECIPE_CATEGORY_LABELS = RECIPE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = cat.label;
    return acc;
  }, {});

  let activeRecipeCategory = 'all';
  let activeRecipeId = null;
  /** Stored in planSides when user explicitly skips a side (no side ingredients). */
  const SIDE_NONE = '__none__';

  // Classification for auto-fill and summary (fish/seafood not counted as meat)
  const MEAT_KEYWORDS = ['chicken', 'beef', 'pork', 'sausage', 'bacon', 'lamb', 'turkey', 'duck', 'ham', 'mince', 'steak'];
  const CARB_CATEGORIES = {
    rice: ['rice', 'risotto'],
    pasta: ['pasta', 'spaghetti', 'penne', 'linguine', 'noodles', 'lasagne', 'lasagna'],
    pizza: ['pizza'],
    potato: ['potato', 'potatoes', 'chips', 'fries', 'wedges']
  };

  // Slots: weekdays = dinner only; Sat/Sun = lunch + dinner
  function getSlotsForDay(day) {
    const isWeekend = day === 'Saturday' || day === 'Sunday';
    return isWeekend ? ['Lunch', 'Dinner'] : ['Dinner'];
  }

  function containsKeyword(text, keywords) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k));
  }

  function isMeaty(meal, variantName, sideName) {
    if (!meal) return false;
    const v = (meal.variants || []).find(vr => vr.name === variantName) || (meal.variants && meal.variants[0]);
    let s = null;
    if (meal.sides && meal.sides.length > 0) {
      if (sideName === SIDE_NONE) s = null;
      else s = sideName ? meal.sides.find(sd => sd.name === sideName) : meal.sides[0];
    }
    const texts = [
      meal.meal_name,
      ...(meal.commonIngredients || []),
      ...(meal.ingredients || []),
      v ? [v.name, ...(v.ingredients || [])] : [],
      s ? [s.name, ...(s.ingredients || [])] : []
    ].flat();
    return texts.some(t => containsKeyword(t, MEAT_KEYWORDS));
  }

  function getCarbTypes(meal, variantName, sideName) {
    const tags = new Set();
    if (!meal) return tags;
    let sideLabel = '';
    if (meal.sides && meal.sides.length > 0) {
      if (sideName === SIDE_NONE) sideLabel = '';
      else {
        const s = sideName ? meal.sides.find(sd => sd.name === sideName) : meal.sides[0];
        if (s) sideLabel = s.name;
      }
    }
    const parts = [meal.meal_name, sideLabel].filter(Boolean);
    const combined = parts.join(' ').toLowerCase();
    for (const [category, keywords] of Object.entries(CARB_CATEGORIES)) {
      if (keywords.some(k => combined.includes(k))) tags.add(category);
    }
    return tags;
  }

  function isSalmonMeal(meal) {
    return meal && containsKeyword(meal.meal_name || '', ['salmon']);
  }

  function isTakeawayMeal(meal) {
    return meal && containsKeyword(meal.meal_name || '', ['takeaway', 'take away', 'take-out', 'take out', 'delivery']);
  }

  function isQuickMeal(meal) {
    return !!(meal && meal.quick);
  }

  function isLongMeal(meal) {
    return meal && containsKeyword(meal.meal_name || '', ['lasagna', 'lasagne', 'roast dinner', 'japanese curry']);
  }

  function mealCanBeMeatFree(meal) {
    const variants = (meal.variants && meal.variants.length) ? meal.variants : [{ name: null, ingredients: [] }];
    const sides = (meal.sides && meal.sides.length) ? meal.sides : [{ name: null, ingredients: [] }];
    for (const v of variants) {
      for (const s of sides) {
        if (!isMeaty(meal, v.name, s.name)) return true;
      }
    }
    return false;
  }

  function shuffleArray(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function autoFillWeek() {
    if (!state.meals.length) {
      alert('Add some meals to your library first.');
      return;
    }
    const slots = [];
    for (const day of DAYS) {
      for (const mealType of getSlotsForDay(day)) {
        slots.push({ day, mealType });
      }
    }
    const salmonMeals = state.meals.filter(isSalmonMeal);
    const meatFreeCandidates = state.meals.filter(mealCanBeMeatFree);
    const takeawayMeals = state.meals.filter(isTakeawayMeal);
    const quickMeals = state.meals.filter(isQuickMeal);
    const salmonSlotIndex = salmonMeals.length > 0 ? Math.floor(Math.random() * slots.length) : -1;
    let takeawaySlotIndex = -1;
    if (takeawayMeals.length > 0 && slots.length >= 5) {
      const endSlots = [];
      for (let j = 4; j < slots.length; j++) endSlots.push(j);
      const avoid = salmonSlotIndex >= 0 ? [salmonSlotIndex] : [];
      const choices = endSlots.filter(j => !avoid.includes(j));
      takeawaySlotIndex = choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)] : endSlots[0];
    }

    for (const key of Object.keys(state.plan)) {
      delete state.plan[key];
      delete state.planVariants[key];
      delete state.planSides[key];
    }
    state.planVariants = {};
    state.planSides = {};
    savePlan();
    savePlanVariants();
    savePlanSides();

    const usedMealNames = new Set();
    let prevCarbTypes = new Set();
    const meatFreeDayIndices = new Set();
    while (meatFreeDayIndices.size < 2 && meatFreeCandidates.length >= 1) {
      meatFreeDayIndices.add(Math.floor(Math.random() * 7));
    }
    const shuffledMeals = shuffleArray(state.meals);

    const allowedForDay = (m, d) => (d === 'Saturday' || d === 'Sunday') || !isLongMeal(m);
    const notUsedThisWeek = (m) => !usedMealNames.has(m.meal_name);

    /** limitPool: only consider meals in this set after preferred is exhausted (e.g. meat-free days). */
    function pickFromPool(preferred, day, allowRepeat, limitPool) {
      const limit = limitPool || shuffledMeals;
      const okUnused = (m) => allowedForDay(m, day) && notUsedThisWeek(m);
      let pool = shuffleArray(preferred).filter(okUnused);
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      pool = shuffleArray(limit).filter(okUnused);
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      if (!allowRepeat) return null;
      pool = shuffleArray(preferred).filter(m => allowedForDay(m, day));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      pool = shuffleArray(limit).filter(m => allowedForDay(m, day));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      return limit[0] || shuffledMeals[0] || null;
    }

    for (let i = 0; i < slots.length; i++) {
      const { day, mealType } = slots[i];
      const dayIndex = DAYS.indexOf(day);
      const needMeatFreeDay = meatFreeDayIndices.has(dayIndex);
      const isSalmonSlot = i === salmonSlotIndex;
      const isTakeawaySlot = i === takeawaySlotIndex;
      const preferQuick = (day === 'Tuesday' || day === 'Thursday') && !isSalmonSlot && !isTakeawaySlot;

      let meal = null;
      let variantName = undefined;
      let sideName = undefined;

      if (isSalmonSlot && salmonMeals.length > 0) {
        meal = pickFromPool(salmonMeals, day, true, salmonMeals);
      } else if (isTakeawaySlot && takeawayMeals.length > 0) {
        meal = pickFromPool(takeawayMeals, day, true, takeawayMeals);
      } else if (needMeatFreeDay && meatFreeCandidates.length > 0) {
        meal = pickFromPool(meatFreeCandidates, day, true, meatFreeCandidates);
      } else if (preferQuick && quickMeals.length > 0) {
        meal = pickFromPool(quickMeals, day, true, shuffledMeals);
      } else {
        const nonTakeaway = shuffledMeals.filter(m => !isTakeawayMeal(m));
        meal = pickFromPool(nonTakeaway.length > 0 ? nonTakeaway : shuffledMeals, day, true, shuffledMeals);
      }
      if (!meal) meal = shuffledMeals[0];

      if (meal.variants && meal.variants.length > 0) {
        const needMeatFree = needMeatFreeDay && !isSalmonSlot;
        let variantPool = meal.variants;
        if (needMeatFree) {
          const meatFreeVariants = meal.variants.filter(v => {
            const sides = (meal.sides && meal.sides.length) ? meal.sides : [{ name: null }];
            return sides.some(sd => !isMeaty(meal, v.name, sd.name));
          });
          if (meatFreeVariants.length > 0) variantPool = meatFreeVariants;
        }
        variantName = variantPool[Math.floor(Math.random() * variantPool.length)].name;
      }
      if (meal.sides && meal.sides.length > 0) {
        const allowedSides = meal.sides.filter(s => {
          const tags = getCarbTypes(meal, variantName, s.name);
          const overlap = [...tags].some(t => prevCarbTypes.has(t));
          return !overlap;
        });
        const sidePool = allowedSides.length > 0 ? allowedSides : meal.sides;
        const needMeatFree = needMeatFreeDay && !isSalmonSlot;
        let sideCandidates = sidePool;
        if (needMeatFree) {
          const meatFreeSides = sidePool.filter(s => !isMeaty(meal, variantName, s.name));
          if (meatFreeSides.length > 0) sideCandidates = meatFreeSides;
        }
        sideName = sideCandidates[Math.floor(Math.random() * sideCandidates.length)].name;
      }

      setPlannedMeal(day, mealType, meal.meal_name, variantName, sideName);
      usedMealNames.add(meal.meal_name);
      prevCarbTypes = getCarbTypes(meal, variantName, sideName);
    }

    renderPlannerGrid();
    renderShoppingList();
    renderWeekSummary();
    if (state.meals.length < slots.length && meatFreeCandidates.length < 2) {
      setTimeout(() => alert('Filled with available meals. Add more (and more meat-free options) for better variety.'), 100);
    }
  }

  /** Random-fill only the slots for one day (lunch+dinner on weekends, dinner only on weekdays). */
  function autoFillDay(day) {
    if (!state.meals.length) {
      alert('Add some meals to your library first.');
      return;
    }
    if (!DAYS.includes(day)) return;

    clearDay(day);

    const daySlots = getSlotsForDay(day);
    const shuffledMeals = shuffleArray(state.meals);
    const allowedForDay = (m, d) => (d === 'Saturday' || d === 'Sunday') || !isLongMeal(m);
    const usedToday = new Set();
    let prevCarbTypes = new Set();

    for (const mealType of daySlots) {
      const preferQuick = (day === 'Tuesday' || day === 'Thursday') && daySlots.length === 1;

      let pool = shuffledMeals.filter(m => allowedForDay(m, day) && !usedToday.has(m.meal_name));
      if (pool.length === 0) pool = shuffledMeals.filter(m => allowedForDay(m, day));
      if (pool.length === 0) pool = shuffledMeals.slice();

      if (preferQuick) {
        const quickPool = pool.filter(isQuickMeal);
        if (quickPool.length > 0) pool = quickPool;
      }

      const meal = pool[Math.floor(Math.random() * pool.length)];
      if (!meal) continue;

      let variantName = undefined;
      let sideName = undefined;

      if (meal.variants && meal.variants.length > 0) {
        variantName = meal.variants[Math.floor(Math.random() * meal.variants.length)].name;
      }
      if (meal.sides && meal.sides.length > 0) {
        const allowedSides = meal.sides.filter(s => {
          const tags = getCarbTypes(meal, variantName, s.name);
          return ![...tags].some(t => prevCarbTypes.has(t));
        });
        const sidePool = allowedSides.length > 0 ? allowedSides : meal.sides;
        sideName = sidePool[Math.floor(Math.random() * sidePool.length)].name;
      }

      setPlannedMeal(day, mealType, meal.meal_name, variantName, sideName);
      usedToday.add(meal.meal_name);
      prevCarbTypes = getCarbTypes(meal, variantName, sideName);
    }

    renderPlannerGrid();
    renderShoppingList();
    renderWeekSummary();
  }

  function clearPlan() {
    state.plan = {};
    state.planVariants = {};
    state.planSides = {};
    savePlan();
    savePlanVariants();
    savePlanSides();
    renderPlannerGrid();
    renderShoppingList();
    renderWeekSummary();
  }

  function clearDay(day) {
    for (const mealType of getSlotsForDay(day)) {
      setPlannedMeal(day, mealType, null);
    }
    renderPlannerGrid();
    renderShoppingList();
    renderWeekSummary();
  }

  // --- State ---
  let state = {
    meals: [],
    plan: {},
    planVariants: {},
    planSides: {},
    shoppingChecked: {},
    recipes: []
  };

  function loadState() {
    try {
      const mealsJson = localStorage.getItem(STORAGE_MEALS);
      const planJson = localStorage.getItem(STORAGE_PLAN);
      const variantsJson = localStorage.getItem(STORAGE_PLAN_VARIANTS);
      const sidesJson = localStorage.getItem(STORAGE_PLAN_SIDES);
      const checkedJson = localStorage.getItem(STORAGE_SHOPPING_CHECKED);
      const recipesJson = localStorage.getItem(STORAGE_RECIPES);
      if (mealsJson) state.meals = JSON.parse(mealsJson);
      if (planJson) state.plan = JSON.parse(planJson);
      if (variantsJson) state.planVariants = JSON.parse(variantsJson);
      if (sidesJson) state.planSides = JSON.parse(sidesJson);
      if (checkedJson) state.shoppingChecked = JSON.parse(checkedJson);
      if (recipesJson) state.recipes = JSON.parse(recipesJson);
    } catch (_) {
      state = { meals: [], plan: {}, planVariants: {}, planSides: {}, shoppingChecked: {}, recipes: [] };
    }
    if (!Array.isArray(state.recipes)) state.recipes = [];
  }

  function saveMeals() {
    localStorage.setItem(STORAGE_MEALS, JSON.stringify(state.meals));
  }

  function savePlan() {
    localStorage.setItem(STORAGE_PLAN, JSON.stringify(state.plan));
  }

  function savePlanVariants() {
    localStorage.setItem(STORAGE_PLAN_VARIANTS, JSON.stringify(state.planVariants));
  }

  function savePlanSides() {
    localStorage.setItem(STORAGE_PLAN_SIDES, JSON.stringify(state.planSides));
  }

  function saveShoppingChecked() {
    localStorage.setItem(STORAGE_SHOPPING_CHECKED, JSON.stringify(state.shoppingChecked));
  }

  function saveRecipes() {
    localStorage.setItem(STORAGE_RECIPES, JSON.stringify(state.recipes));
  }

  const SHARE_VERSION = 2;

  function exportFullState() {
    return JSON.stringify({
      version: SHARE_VERSION,
      meals: state.meals,
      plan: state.plan,
      planVariants: state.planVariants,
      planSides: state.planSides,
      shoppingChecked: state.shoppingChecked,
      recipes: state.recipes
    });
  }

  function importFullState(json) {
    let data;
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (_) {
      return false;
    }
    if (!data || typeof data.version !== 'number') return false;
    if (Array.isArray(data.meals)) state.meals = data.meals;
    if (data.plan && typeof data.plan === 'object') state.plan = data.plan;
    if (data.planVariants && typeof data.planVariants === 'object') state.planVariants = data.planVariants;
    if (data.planSides && typeof data.planSides === 'object') state.planSides = data.planSides;
    if (data.shoppingChecked && typeof data.shoppingChecked === 'object') state.shoppingChecked = data.shoppingChecked;
    if (Array.isArray(data.recipes)) state.recipes = data.recipes;
    saveMeals();
    savePlan();
    savePlanVariants();
    savePlanSides();
    saveShoppingChecked();
    saveRecipes();
    localStorage.setItem(STORAGE_WIZARD_DONE, 'true');
    return true;
  }

  const QR_MAX_CHARS = 2953;

  function encodeStateForUrl(str) {
    if (typeof pako !== 'undefined') {
      const bytes = new TextEncoder().encode(str);
      const compressed = pako.deflate(bytes, { level: 9 });
      const binary = String.fromCharCode.apply(null, compressed);
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function decodeStateFromUrl(b64) {
    try {
      if (typeof pako !== 'undefined') {
        try {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const decompressed = pako.inflate(bytes);
          return new TextDecoder().decode(decompressed);
        } catch (_) {
          /* fallback: legacy uncompressed base64 */
        }
      }
      return decodeURIComponent(escape(atob(b64)));
    } catch (_) {
      return null;
    }
  }

  function getShareUrl() {
    const json = exportFullState();
    const encoded = encodeStateForUrl(json);
    const base = window.location.origin + window.location.pathname;
    return base + '#data=' + encoded;
  }

  function generateQR(containerEl) {
    if (typeof qrcode === 'undefined') return false;
    const url = getShareUrl();
    if (url.length > QR_MAX_CHARS) return false;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const imgTag = qr.createImgTag(4, 2);
      containerEl.innerHTML = imgTag;
      return true;
    } catch (_) {
      return false;
    }
  }

  function checkUrlImport() {
    const hash = window.location.hash;
    const match = hash && hash.indexOf('#data=') === 0 && hash.slice(6);
    if (!match) return;
    const json = decodeStateFromUrl(match);
    if (!json) return;
    if (!confirm('Replace your current plan with the shared plan?')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    if (importFullState(json)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      renderMealLibrary(true);
      renderPlannerGrid();
      renderShoppingList();
      renderRecipes();
    }
  }

  function getPlanKey(day, mealType) {
    return `${day}|${mealType}`;
  }

  function getPlannedMeal(day, mealType) {
    return state.plan[getPlanKey(day, mealType)] || null;
  }

  function getPlannedVariant(day, mealType) {
    return state.planVariants[getPlanKey(day, mealType)] || null;
  }

  function getPlannedSide(day, mealType) {
    return state.planSides[getPlanKey(day, mealType)] || null;
  }

  function setPlannedMeal(day, mealType, mealName, variantName, sideName) {
    const key = getPlanKey(day, mealType);
    if (mealName) {
      state.plan[key] = mealName;
      if (variantName != null) state.planVariants[key] = variantName;
      else delete state.planVariants[key];
      if (sideName != null) state.planSides[key] = sideName;
      else delete state.planSides[key];
    } else {
      delete state.plan[key];
      delete state.planVariants[key];
      delete state.planSides[key];
    }
    savePlan();
    savePlanVariants();
    savePlanSides();
  }

  function addMeal(name, ingredientsListOrOptions) {
    let meal;
    if (ingredientsListOrOptions != null && typeof ingredientsListOrOptions === 'object' && !Array.isArray(ingredientsListOrOptions)) {
      const opt = ingredientsListOrOptions;
      const common = (opt.commonIngredients || []).map(s => String(s).trim()).filter(Boolean);
      const variants = (opt.variants || []).map(v => ({
        name: String(v.name || '').trim(),
        ingredients: Array.isArray(v.ingredients) ? v.ingredients.map(s => String(s).trim()).filter(Boolean) : []
      })).filter(v => v.name);
      const sides = (opt.sides || []).map(s => ({
        name: String(s.name || '').trim(),
        ingredients: Array.isArray(s.ingredients) ? s.ingredients.map(x => String(x).trim()).filter(Boolean) : []
      })).filter(s => s.name);
      if (variants.length > 0) {
        meal = { meal_name: name, commonIngredients: common, variants };
      } else {
        meal = { meal_name: name, ingredients: common.length ? common : [] };
      }
      if (sides.length > 0) meal.sides = sides;
      if (opt.emoji) meal.emoji = String(opt.emoji).trim();
      if (opt.quick) meal.quick = true;
    } else {
      const ingredients = Array.isArray(ingredientsListOrOptions)
        ? ingredientsListOrOptions.map(s => String(s).trim()).filter(Boolean)
        : (ingredientsListOrOptions || '').split(',').map(s => s.trim()).filter(Boolean);
      meal = { meal_name: name, ingredients };
    }
    state.meals.push(meal);
    saveMeals();
    return meal;
  }

  function removeMeal(mealName) {
    state.meals = state.meals.filter(m => m.meal_name !== mealName);
    saveMeals();
    for (const key of Object.keys(state.plan)) {
      if (state.plan[key] === mealName) {
        delete state.plan[key];
        delete state.planVariants[key];
        delete state.planSides[key];
      }
    }
    savePlan();
    savePlanVariants();
    savePlanSides();
  }

  function getIngredientsForPlannedSlot(day, mealType) {
    const mealName = getPlannedMeal(day, mealType);
    const meal = mealName ? getMealByName(mealName) : null;
    if (!meal) return [];
    let ingredients = [];
    const variants = meal.variants && meal.variants.length > 0;
    if (variants) {
      const variantName = getPlannedVariant(day, mealType);
      const variant = variantName ? meal.variants.find(v => v.name === variantName) : meal.variants[0];
      const common = (meal.commonIngredients || []).map(s => s.trim()).filter(Boolean);
      const variantIng = variant ? (variant.ingredients || []).map(s => s.trim()).filter(Boolean) : [];
      ingredients = [...common, ...variantIng];
    } else {
      ingredients = (meal.ingredients || []).map(s => s.trim()).filter(Boolean);
    }
    const sides = meal.sides && meal.sides.length > 0;
    if (sides) {
      const sideName = getPlannedSide(day, mealType);
      if (sideName !== SIDE_NONE) {
        const side = sideName ? meal.sides.find(s => s.name === sideName) : meal.sides[0];
        if (side && side.ingredients) {
          ingredients = ingredients.concat((side.ingredients || []).map(s => String(s).trim()).filter(Boolean));
        }
      }
    }
    return ingredients;
  }

  function getMealByName(name) {
    return state.meals.find(m => m.meal_name === name) || null;
  }

  function getMealEmoji(meal) {
    return (meal && meal.emoji) ? String(meal.emoji).trim() : '';
  }

  // --- CSV ---
  function escapeCsvField(str) {
    if (str == null) return '';
    const s = String(str);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function mealsToCsv() {
    const header = 'meal_name,emoji,quick,common_ingredients,variants_json,sides_json';
    const rows = state.meals.map(m => {
      const hasVariants = m.variants && m.variants.length > 0;
      const common = hasVariants ? (m.commonIngredients || []).join(';') : (m.ingredients || []).join(';');
      const variantsJson = hasVariants ? JSON.stringify(m.variants) : '[]';
      const sidesJson = (m.sides && m.sides.length > 0) ? JSON.stringify(m.sides) : '[]';
      const emoji = getMealEmoji(m);
      const quick = m.quick ? 'yes' : '';
      return `${escapeCsvField(m.meal_name)},${escapeCsvField(emoji)},${escapeCsvField(quick)},${escapeCsvField(common)},${escapeCsvField(variantsJson)},${escapeCsvField(sidesJson)}`;
    });
    return [header, ...rows].join('\n');
  }

  function planToCsv() {
    const header = 'day,meal_type,meal_name,variant_name,side_name';
    const rows = [];
    for (const day of DAYS) {
      for (const mealType of getSlotsForDay(day)) {
        const name = getPlannedMeal(day, mealType);
        const variant = getPlannedVariant(day, mealType);
        const side = getPlannedSide(day, mealType);
        const sideOut = side === SIDE_NONE ? SIDE_NONE : (side || '');
        if (name) rows.push(`${escapeCsvField(day)},${escapeCsvField(mealType)},${escapeCsvField(name)},${escapeCsvField(variant || '')},${escapeCsvField(sideOut)}`);
      }
    }
    return [header, ...rows].join('\n');
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(s => s.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const row = {};
      header.forEach((h, j) => { row[h] = values[j] != null ? values[j] : ''; });
      rows.push(row);
    }
    return rows;
  }

  function parseCsvLine(line) {
    const out = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let s = '';
        i++;
        while (i < line.length) {
          if (line[i] === '"') {
            i++;
            if (line[i] === '"') { s += '"'; i++; }
            else break;
          } else {
            s += line[i];
            i++;
          }
        }
        out.push(s);
        if (line[i] === ',') i++;
        continue;
      }
      let s = '';
      while (i < line.length && line[i] !== ',') {
        s += line[i];
        i++;
      }
      out.push(s.trim());
      if (line[i] === ',') i++;
    }
    return out;
  }

  function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadJson(content, filename) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importMealsFromCsv(text) {
    const rows = parseCsv(text);
    for (const row of rows) {
      const name = (row.meal_name || row.mealName || '').trim();
      if (!name) continue;
      const emojiStr = (row.emoji || '').trim();
      const quickStr = (row.quick || '').trim().toLowerCase();
      const commonStr = (row.common_ingredients || row.commonIngredients || '').trim();
      const variantsStr = (row.variants_json || row.variantsJson || '').trim();
      const sidesStr = (row.sides_json || row.sidesJson || '').trim();
      let meal;
      if (variantsStr) {
        try {
          const variants = JSON.parse(variantsStr);
          if (Array.isArray(variants) && variants.length > 0) {
            const common = commonStr ? commonStr.split(';').map(s => s.trim()).filter(Boolean) : [];
            meal = { meal_name: name, commonIngredients: common, variants };
          }
        } catch (_) {}
      }
      if (!meal) {
        const ing = (row.ingredients || commonStr || '').trim();
        const ingredients = ing ? ing.split(';').map(s => s.trim()).filter(Boolean) : [];
        meal = { meal_name: name, ingredients };
      }
      if (meal && sidesStr) {
        try {
          const sides = JSON.parse(sidesStr);
          if (Array.isArray(sides) && sides.length > 0) meal.sides = sides;
        } catch (_) {}
      }
      if (meal && emojiStr) meal.emoji = emojiStr;
      if (meal && (quickStr === 'yes' || quickStr === '1' || quickStr === 'true')) meal.quick = true;
      if (meal && !state.meals.some(m => m.meal_name === name)) {
        state.meals.push(meal);
      }
    }
    saveMeals();
  }

  function importPlanFromCsv(text) {
    const rows = parseCsv(text);
    for (const row of rows) {
      const day = (row.day || '').trim();
      const mealType = (row.meal_type || row.mealType || '').trim();
      const name = (row.meal_name || row.mealName || '').trim();
      const variant = (row.variant_name || row.variantName || '').trim() || undefined;
      const sideRaw = (row.side_name || row.sideName || '').trim();
      const side = sideRaw === SIDE_NONE ? SIDE_NONE : (sideRaw || undefined);
      if (day && mealType && name && DAYS.includes(day)) {
        setPlannedMeal(day, mealType, name, variant, side);
      }
    }
  }

  // --- Shopping list ---
  let shoppingRemoved = new Set();

  function getShoppingItems() {
    const tally = new Map();
    for (const day of DAYS) {
      for (const mealType of getSlotsForDay(day)) {
        getIngredientsForPlannedSlot(day, mealType).forEach(raw => {
          const t = String(raw).trim();
          if (!t) return;
          const key = t.toLowerCase();
          const cur = tally.get(key);
          if (cur) cur.count += 1;
          else tally.set(key, { display: t, count: 1 });
        });
      }
    }
    return Array.from(tally.values())
      .map(({ display, count }) => (count > 1 ? `${display} x${count}` : display))
      .filter(label => !shoppingRemoved.has(label))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function isShoppingItemChecked(item) {
    return !!state.shoppingChecked[item];
  }

  function setShoppingItemChecked(item, checked) {
    state.shoppingChecked[item] = checked;
    saveShoppingChecked();
  }

  function renderShoppingList() {
    const container = document.getElementById('shopping-list');
    const totalEl = document.getElementById('shopping-list-total');
    if (!container) return;
    const items = getShoppingItems();
    if (totalEl) {
      if (items.length === 0) totalEl.textContent = '';
      else {
        const totalUnits = items.reduce((sum, label) => {
          const m = String(label).match(/ x(\d+)$/);
          return sum + (m ? parseInt(m[1], 10) : 1);
        }, 0);
        totalEl.textContent = totalUnits === items.length
          ? `(${items.length} ingredient${items.length !== 1 ? 's' : ''})`
          : `(${items.length} lines · ${totalUnits} total)`;
      }
    }
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<p class="shopping-list-empty">Add meals to your plan to see ingredients here.</p>';
      return;
    }
    const restoreBtn = document.getElementById('restore-shopping-btn');
    if (restoreBtn) restoreBtn.hidden = shoppingRemoved.size === 0;
    items.forEach(item => {
      const li = document.createElement('div');
      li.className = 'shopping-item' + (isShoppingItemChecked(item) ? ' checked' : '');
      li.setAttribute('role', 'listitem');
      const id = 'shop-' + item.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
      li.innerHTML = `
        <input type="checkbox" id="${id}" ${isShoppingItemChecked(item) ? 'checked' : ''}>
        <label for="${id}">${escapeHtml(item)}</label>
        <button type="button" class="btn-icon remove-shopping-btn" title="Remove">&times;</button>
      `;
      li.querySelector('input').addEventListener('change', function () {
        setShoppingItemChecked(item, this.checked);
        li.classList.toggle('checked', this.checked);
      });
      li.querySelector('.remove-shopping-btn').addEventListener('click', () => {
        shoppingRemoved.add(item);
        renderShoppingList();
      });
      container.appendChild(li);
    });
  }

  function copyShoppingToClipboard() {
    const items = getShoppingItems();
    const text = items.map(i => (isShoppingItemChecked(i) ? '[x] ' : '[ ] ') + i).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function exportShoppingCsv() {
    const items = getShoppingItems();
    const header = 'item,checked';
    const rows = items.map(i => `${escapeCsvField(i)},${isShoppingItemChecked(i) ? 'yes' : 'no'}`);
    downloadCsv([header, ...rows].join('\n'), 'shopping_list.csv');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // --- Recipes ---
  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'recipe';
  }

  function makeRecipeId(title) {
    return `rec_${Date.now()}_${slugify(title)}`;
  }

  function getRecipeCategoryLabel(category) {
    return RECIPE_CATEGORY_LABELS[category] || RECIPE_CATEGORY_LABELS.other;
  }

  function normaliseRecipeIngredient(ingredient) {
    if (typeof ingredient === 'string') {
      return { qty: '', unit: '', name: ingredient.trim(), notes: null, emoji: '' };
    }
    if (!ingredient || typeof ingredient !== 'object') return null;
    const name = String(ingredient.name || '').trim();
    if (!name) return null;
    return {
      qty: String(ingredient.qty || '').trim(),
      unit: String(ingredient.unit || '').trim(),
      name,
      notes: ingredient.notes == null ? null : String(ingredient.notes).trim() || null,
      emoji: String(ingredient.emoji || '').trim()
    };
  }

  function normaliseRecipe(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'Recipe must be a JSON object.' };
    const title = String(raw.title || '').trim();
    if (!title) return { error: 'Recipe needs a title.' };
    const ingredients = Array.isArray(raw.ingredients)
      ? raw.ingredients.map(normaliseRecipeIngredient).filter(Boolean)
      : [];
    if (ingredients.length === 0) return { error: 'Recipe needs at least one ingredient.' };
    const steps = Array.isArray(raw.steps)
      ? raw.steps.map(step => String(step || '').trim()).filter(Boolean)
      : [];
    if (steps.length === 0) return { error: 'Recipe needs at least one step.' };
    const category = RECIPE_CATEGORY_LABELS[raw.category] ? raw.category : 'other';
    const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map(tag => String(tag || '').trim()).filter(Boolean)
      : [];
    const recipe = {
      id: String(raw.id || '').trim() || makeRecipeId(title),
      title,
      source: {
        type: ['instagram', 'web', 'screenshot', 'manual'].includes(source.type) ? source.type : 'manual',
        url: source.url ? String(source.url).trim() : null,
        label: source.label ? String(source.label).trim() : null
      },
      imageUrl: raw.imageUrl ? String(raw.imageUrl).trim() : null,
      servings: Number.parseInt(raw.servings, 10) || 4,
      category,
      tags,
      ingredients,
      steps,
      notes: raw.notes == null ? '' : String(raw.notes),
      createdAt: raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
      mealName: raw.mealName ? String(raw.mealName) : null
    };
    return { recipe };
  }

  function parseRecipeJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return { error: 'Could not parse JSON. Check for missing commas or extra markdown.' };
    }
    if (Array.isArray(parsed)) {
      const recipes = [];
      for (const item of parsed) {
        const res = normaliseRecipe(item);
        if (res.error) return res;
        recipes.push(res.recipe);
      }
      return { recipes };
    }
    return normaliseRecipe(parsed);
  }

  function upsertRecipes(recipes) {
    for (const recipe of recipes) {
      const existingIndex = state.recipes.findIndex(r => r.id === recipe.id || r.title.toLowerCase() === recipe.title.toLowerCase());
      if (existingIndex >= 0) state.recipes[existingIndex] = { ...state.recipes[existingIndex], ...recipe };
      else state.recipes.push(recipe);
    }
    saveRecipes();
  }

  function getRecipeById(id) {
    return state.recipes.find(recipe => recipe.id === id) || null;
  }

  function renderRecipeCategories() {
    const container = document.getElementById('recipe-category-filters');
    if (!container) return;
    container.innerHTML = '';
    for (const cat of RECIPE_CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recipe-category-chip' + (activeRecipeCategory === cat.id ? ' active' : '');
      btn.dataset.category = cat.id;
      const count = cat.id === 'all'
        ? state.recipes.length
        : state.recipes.filter(recipe => recipe.category === cat.id).length;
      btn.textContent = `${cat.label} (${count})`;
      container.appendChild(btn);
    }
  }

  function getFilteredRecipes() {
    const query = (document.getElementById('recipe-search')?.value || '').trim().toLowerCase();
    return state.recipes
      .filter(recipe => activeRecipeCategory === 'all' || recipe.category === activeRecipeCategory)
      .filter(recipe => {
        if (!query) return true;
        const haystack = [
          recipe.title,
          recipe.category,
          ...(recipe.tags || []),
          ...(recipe.ingredients || []).map(i => i.name)
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function renderRecipesList() {
    renderRecipeCategories();
    const list = document.getElementById('recipes-list');
    const detail = document.getElementById('recipe-detail');
    if (!list) return;
    if (detail) detail.hidden = true;
    list.hidden = false;
    list.innerHTML = '';
    const recipes = getFilteredRecipes();
    if (recipes.length === 0) {
      list.innerHTML = '<p class="recipes-empty">No recipes yet. Add one from a link, screenshot notes, or pasted JSON.</p>';
      return;
    }
    for (const recipe of recipes) {
      const card = document.createElement('article');
      card.className = 'recipe-card';
      card.setAttribute('role', 'listitem');
      card.dataset.recipeId = recipe.id;
      const tags = (recipe.tags || []).slice(0, 3).map(tag => `<span class="recipe-tag">${escapeHtml(tag)}</span>`).join('');
      const copied = recipe.mealName ? '<span class="recipe-card-status">In meals</span>' : '';
      card.innerHTML = `
        <div class="recipe-card-thumb">${recipe.imageUrl ? `<img src="${escapeHtml(recipe.imageUrl)}" alt="">` : '<span>Recipe</span>'}</div>
        <div class="recipe-card-body">
          <div class="recipe-card-title-row">
            <h3>${escapeHtml(recipe.title)}</h3>
            ${copied}
          </div>
          <p>${escapeHtml(getRecipeCategoryLabel(recipe.category))}${recipe.source?.type ? ' · ' + escapeHtml(recipe.source.type) : ''}</p>
          <div class="recipe-tags">${tags}</div>
        </div>
      `;
      list.appendChild(card);
    }
  }

  function formatRecipeIngredient(ingredient, includeQty) {
    const qty = [ingredient.qty, ingredient.unit].map(s => String(s || '').trim()).filter(Boolean).join(' ');
    const base = includeQty && qty ? `${qty} ${ingredient.name}` : ingredient.name;
    return ingredient.notes ? `${base} (${ingredient.notes})` : base;
  }

  function renderRecipeDetail(recipeId) {
    const recipe = getRecipeById(recipeId);
    const list = document.getElementById('recipes-list');
    const detail = document.getElementById('recipe-detail');
    if (!recipe || !detail) return;
    activeRecipeId = recipe.id;
    if (list) list.hidden = true;
    detail.hidden = false;
    const sourceLabel = recipe.source?.label || (recipe.source?.type === 'instagram' ? 'Open Instagram' : 'Open source');
    const sourceLink = recipe.source?.url
      ? `<a href="${escapeHtml(recipe.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a>`
      : '<span>No source link</span>';
    const tags = (recipe.tags || []).map(tag => `<span class="recipe-tag">${escapeHtml(tag)}</span>`).join('');
    const ingredients = recipe.ingredients.map(ingredient => `
      <li>${ingredient.emoji ? `<span class="recipe-ingredient-emoji">${escapeHtml(ingredient.emoji)}</span>` : ''}<span>${escapeHtml(formatRecipeIngredient(ingredient, true))}</span></li>
    `).join('');
    const steps = recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    const isMeal = recipe.category === 'meal';
    detail.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="back-to-recipes-btn">Back to recipes</button>
      <div class="recipe-detail-hero">${recipe.imageUrl ? `<img src="${escapeHtml(recipe.imageUrl)}" alt="">` : '<span>Recipe</span>'}</div>
      <div class="recipe-detail-header">
        <div>
          <p class="recipe-detail-category">${escapeHtml(getRecipeCategoryLabel(recipe.category))}</p>
          <h2>${escapeHtml(recipe.title)}</h2>
        </div>
        <button type="button" class="btn ${isMeal ? 'btn-primary' : 'btn-secondary'}" id="copy-recipe-to-meal-btn">${isMeal ? 'Copy to meal list' : 'Also make this a meal'}</button>
      </div>
      <div class="recipe-detail-meta">${sourceLink}</div>
      <div class="recipe-tags">${tags}</div>
      <label for="recipe-notes-input">Comments / notes</label>
      <textarea id="recipe-notes-input" rows="3">${escapeHtml(recipe.notes || '')}</textarea>
      <section>
        <h3>Ingredients <span>${escapeHtml(String(recipe.servings))} servings</span></h3>
        <ul class="recipe-ingredients">${ingredients}</ul>
      </section>
      <section>
        <h3>Instructions</h3>
        <ol class="recipe-steps">${steps}</ol>
      </section>
    `;
  }

  function renderRecipes() {
    if (activeRecipeId && getRecipeById(activeRecipeId)) renderRecipeDetail(activeRecipeId);
    else renderRecipesList();
  }

  function copyRecipeToMeal(recipeId) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return;
    const ingredients = recipe.ingredients.map(ingredient => ingredient.name).filter(Boolean);
    const existing = state.meals.find(m => m.meal_name.toLowerCase() === recipe.title.toLowerCase());
    if (existing) {
      if (!confirm(`"${recipe.title}" is already in your meal list. Update its ingredients from this recipe?`)) return;
      existing.ingredients = ingredients;
      delete existing.commonIngredients;
      delete existing.variants;
      delete existing.sides;
    } else {
      state.meals.push({ meal_name: recipe.title, ingredients });
    }
    recipe.mealName = recipe.title;
    saveMeals();
    saveRecipes();
    renderMealLibrary();
    renderPlannerGrid();
    renderRecipes();
    alert(`"${recipe.title}" is now in your meal list.`);
  }

  function buildRecipePrompt() {
    const type = document.getElementById('recipe-source-type')?.value || 'manual';
    const url = document.getElementById('recipe-source-url')?.value?.trim() || '';
    const notes = document.getElementById('recipe-source-notes')?.value?.trim() || '';
    return `You are an extractor. Read the recipe source below and return ONE valid JSON object only, with no markdown or commentary.

Schema:
{
  "title": "string",
  "source": {"type": "instagram|web|screenshot|manual", "url": "string|null", "label": "string|null"},
  "imageUrl": "string|null",
  "servings": 4,
  "category": "meal|toddler_snack|baking|side|other",
  "tags": ["string"],
  "ingredients": [{"qty": "string", "unit": "string", "name": "string", "notes": "string|null", "emoji": "single emoji or empty"}],
  "steps": ["string"],
  "notes": "string|null"
}

Rules:
- Pick exactly one category. Use toddler_snack for baby/toddler snacks such as muffins, banana bread, oat bars, pancakes, fritters or lunchbox snacks.
- qty as written ("1", "1/2", "1-2"); unit lowercase ("g", "ml", "can", "tbsp", "clove", "handful", "" if none).
- One emoji per ingredient if obvious, otherwise "".
- Steps are imperative sentences with no numbering inside the string.
- Include useful tags like healthy, freezer friendly, vegetarian, quick, 1 year old, dinner, snack.

Source type: ${type}
Source URL: ${url || 'none'}
Notes or screenshot context:
${notes || 'Paste/attach the screenshot or recipe notes here.'}`;
  }

  function openRecipeModal() {
    const overlay = document.getElementById('recipe-modal-overlay');
    if (!overlay) return;
    document.getElementById('recipe-json-input').value = '';
    document.getElementById('recipe-json-error').hidden = true;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  function closeRecipeModal() {
    const overlay = document.getElementById('recipe-modal-overlay');
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
  }

  function saveRecipeFromTextarea() {
    const input = document.getElementById('recipe-json-input');
    const error = document.getElementById('recipe-json-error');
    const result = parseRecipeJson(input?.value || '');
    if (result.error) {
      if (error) {
        error.textContent = result.error;
        error.hidden = false;
      }
      return;
    }
    const recipes = result.recipes || [result.recipe];
    upsertRecipes(recipes);
    closeRecipeModal();
    activeRecipeId = recipes[0].id;
    renderRecipes();
    showAppPanel('recipes');
  }

  function exportRecipesJson() {
    downloadJson(JSON.stringify(state.recipes, null, 2), 'recipes.json');
  }

  function importRecipesFile(e) {
    const input = e.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseRecipeJson(reader.result);
      if (result.error) {
        alert(result.error);
        return;
      }
      upsertRecipes(result.recipes || [result.recipe]);
      renderRecipesList();
    };
    reader.readAsText(file);
  }

  function loadBundledRecipesIfEmpty() {
    if (state.recipes.length > 0) return Promise.resolve();
    return fetch(BUNDLED_RECIPES_JSON, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('bundled recipes unavailable');
        return r.json();
      })
      .then(data => {
        const items = Array.isArray(data) ? data : [data];
        const recipes = [];
        for (const item of items) {
          const res = normaliseRecipe(item);
          if (!res.error) recipes.push(res.recipe);
        }
        if (recipes.length > 0) upsertRecipes(recipes);
      })
      .catch(() => {});
  }

  // --- Planner grid ---
  function renderPlannerGrid() {
    const grid = document.getElementById('planner-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const day of DAYS) {
      const slots = getSlotsForDay(day);
      const col = document.createElement('div');
      col.className = 'planner-day';
      col.dataset.day = day;

      const headerEl = document.createElement('div');
      headerEl.className = 'planner-day-header';
      headerEl.innerHTML = `
        <span class="planner-day-name" title="${escapeHtml(day)}"><span class="planner-day-name-long">${escapeHtml(day)}</span><span class="planner-day-name-short">${escapeHtml(dayAbbrev(day))}</span></span>
        <span class="planner-day-toolbar">
          <button type="button" class="btn-icon random-day-btn" title="Random meals for ${escapeHtml(day)}" data-day="${escapeHtml(day)}" aria-label="Random meals for ${escapeHtml(day)}">&#127922;</button>
          <button type="button" class="btn-icon clear-day-btn" title="Clear ${day}" data-day="${escapeHtml(day)}" aria-label="Clear ${escapeHtml(day)}">&times;</button>
        </span>`;

      const slotsWrap = document.createElement('div');
      slotsWrap.className = 'planner-day-slots';

      for (const mealType of slots) {
        const mealName = getPlannedMeal(day, mealType);
        const variantName = getPlannedVariant(day, mealType);
        const sideName = getPlannedSide(day, mealType);
        const meal = getMealByName(mealName);
        const emoji = meal ? getMealEmoji(meal) : '';
        let displayName = variantName ? `${mealName} (${variantName})` : mealName;
        if (sideName && sideName !== SIDE_NONE) displayName += ' with ' + sideName;
        const slotId = `slot-${day}-${mealType}`;
        const slotDiv = document.createElement('div');
        slotDiv.className = 'planner-slot' + (mealName ? '' : ' empty');
        slotDiv.dataset.day = day;
        slotDiv.dataset.mealType = mealType;
        slotDiv.id = slotId;
        slotDiv.setAttribute('role', 'list');
        if (slots.length > 1) {
          const lab = document.createElement('span');
          lab.className = 'slot-label';
          lab.textContent = mealType;
          slotDiv.appendChild(lab);
        }
        if (mealName) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'planned-meal';
          btn.dataset.day = day;
          btn.dataset.mealType = mealType;
          btn.draggable = true;
          if (emoji) {
            const em = document.createElement('span');
            em.className = 'meal-emoji-display';
            em.textContent = emoji;
            btn.appendChild(em);
          }
          const nameSpan = document.createElement('span');
          nameSpan.className = 'planned-meal-label';
          nameSpan.textContent = displayName;
          btn.appendChild(nameSpan);
          if (meal && meal.quick) {
            const q = document.createElement('span');
            q.className = 'meal-quick-icon';
            q.title = 'Quick meal';
            q.textContent = '⚡';
            btn.appendChild(q);
          }
          slotDiv.appendChild(btn);
        }
        slotsWrap.appendChild(slotDiv);
      }

      col.appendChild(headerEl);
      col.appendChild(slotsWrap);
      grid.appendChild(col);
    }
    renderWeekSummary();
    attachPlannerDragDrop();
  }

  function renderWeekSummary() {
    const el = document.getElementById('week-summary');
    if (!el) return;
    const meatByDay = new Set();
    const meatFreeByDay = new Set();
    const carbCounts = { rice: 0, pasta: 0, pizza: 0, potato: 0 };
    let salmonCount = 0;
    for (const day of DAYS) {
      const slots = getSlotsForDay(day);
      let dayHasMeat = false;
      let dayHasAnyMeal = false;
      for (const mealType of slots) {
        const mealName = getPlannedMeal(day, mealType);
        const meal = getMealByName(mealName);
        if (!meal) continue;
        dayHasAnyMeal = true;
        const v = getPlannedVariant(day, mealType);
        const s = getPlannedSide(day, mealType);
        if (isMeaty(meal, v, s)) dayHasMeat = true;
        const carbs = getCarbTypes(meal, v, s);
        for (const c of carbs) carbCounts[c] = (carbCounts[c] || 0) + 1;
        if (isSalmonMeal(meal)) salmonCount++;
      }
      if (dayHasMeat) meatByDay.add(day);
      if (dayHasAnyMeal && !dayHasMeat) meatFreeByDay.add(day);
    }
    const parts = [];
    if (meatByDay.size > 0) parts.push(`<span class="week-summary-pill week-summary-meat">Meat: ${meatByDay.size} days</span>`);
    if (meatFreeByDay.size > 0) parts.push(`<span class="week-summary-pill week-summary-meatfree">Meat-free: ${meatFreeByDay.size} days</span>`);
    if (salmonCount > 0) parts.push(`<span class="week-summary-pill week-summary-salmon">Salmon: ${salmonCount}x</span>`);
    for (const [key, count] of Object.entries(carbCounts)) {
      if (count > 0) parts.push(`<span class="week-summary-pill week-summary-carb">${key}: ${count}x</span>`);
    }
    el.innerHTML = parts.length ? parts.join('') : '<span class="week-summary-empty">No meals planned</span>';
  }

  function attachPlannerDragDrop() {
    document.querySelectorAll('.clear-day-btn').forEach(btn => {
      btn.addEventListener('click', () => clearDay(btn.dataset.day));
    });
    document.querySelectorAll('.random-day-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        autoFillDay(btn.dataset.day);
      });
    });
    const slots = document.querySelectorAll('.planner-slot');
    slots.forEach(slot => {
      slot.addEventListener('dragover', onSlotDragover);
      slot.addEventListener('dragleave', onSlotDragleave);
      slot.addEventListener('drop', onSlotDrop);
    });
    document.querySelectorAll('.planned-meal').forEach(btn => {
      btn.addEventListener('dragstart', onMealDragStart);
      btn.addEventListener('dragend', onMealDragEnd);
    });
    document.querySelectorAll('.meal-card').forEach(card => {
      const drag = !isMobileViewport();
      card.setAttribute('draggable', drag ? 'true' : 'false');
      if (drag) {
        card.addEventListener('dragstart', onLibraryCardDragStart);
        card.addEventListener('dragend', onMealDragEnd);
      }
    });
  }

  function onSlotDragover(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function onSlotDragleave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function onSlotDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const day = e.currentTarget.dataset.day;
    const mealType = e.currentTarget.dataset.mealType;
    const payload = e.dataTransfer.getData('application/json');
    if (!payload) return;
    const data = JSON.parse(payload);
    if (data.fromPlan) {
      setPlannedMeal(data.day, data.mealType, null);
    }
    const meal = getMealByName(data.mealName);
    const hasVariants = meal && meal.variants && meal.variants.length > 0;
    const hasSides = meal && meal.sides && meal.sides.length > 0;
    const done = () => { renderPlannerGrid(); renderShoppingList(); };
    if (hasVariants && !data.variantName) {
      openVariantPicker(day, mealType, data.mealName, hasSides ? (variantName) => openSidePicker(day, mealType, data.mealName, variantName, done) : done);
    } else if (hasSides && !data.sideName) {
      openSidePicker(day, mealType, data.mealName, data.variantName || undefined, done);
    } else {
      setPlannedMeal(day, mealType, data.mealName, data.variantName || undefined, data.sideName || undefined);
      done();
    }
  }

  function openVariantPicker(day, mealType, mealName, onSelected) {
    const meal = getMealByName(mealName);
    if (!meal || !meal.variants || meal.variants.length === 0) return;
    const overlay = document.getElementById('variant-picker-overlay');
    const mealNameEl = document.getElementById('variant-picker-meal-name');
    const optionsEl = document.getElementById('variant-picker-options');
    if (!overlay || !mealNameEl || !optionsEl) return;
    const emoji = getMealEmoji(meal);
    mealNameEl.innerHTML = emoji ? `<span class="meal-emoji-display">${escapeHtml(emoji)}</span>${escapeHtml(mealName)}` : escapeHtml(mealName);
    optionsEl.innerHTML = '';
    meal.variants.forEach(v => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-block';
      btn.textContent = v.name;
      btn.addEventListener('click', () => {
        setPlannedMeal(day, mealType, mealName, v.name);
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
        const hasSides = meal.sides && meal.sides.length > 0;
        if (hasSides && typeof onSelected === 'function') {
          onSelected(v.name);
        } else if (typeof onSelected === 'function') {
          onSelected();
        } else {
          renderPlannerGrid();
          renderShoppingList();
        }
      });
      optionsEl.appendChild(btn);
    });
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  function openSidePicker(day, mealType, mealName, variantName, onSelected) {
    const meal = getMealByName(mealName);
    if (!meal || !meal.sides || meal.sides.length === 0) return;
    const overlay = document.getElementById('side-picker-overlay');
    const mealNameEl = document.getElementById('side-picker-meal-name');
    const optionsEl = document.getElementById('side-picker-options');
    if (!overlay || !mealNameEl || !optionsEl) return;
    const emoji = getMealEmoji(meal);
    mealNameEl.innerHTML = emoji ? `<span class="meal-emoji-display">${escapeHtml(emoji)}</span>${escapeHtml(mealName)}` : escapeHtml(mealName);
    optionsEl.innerHTML = '';
    meal.sides.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-block';
      btn.textContent = s.name;
      btn.addEventListener('click', () => {
        setPlannedMeal(day, mealType, mealName, variantName || undefined, s.name);
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
        if (typeof onSelected === 'function') onSelected();
        else {
          renderPlannerGrid();
          renderShoppingList();
        }
      });
      optionsEl.appendChild(btn);
    });
    const noSideBtn = document.createElement('button');
    noSideBtn.type = 'button';
    noSideBtn.className = 'btn btn-secondary btn-block';
    noSideBtn.textContent = 'No side';
    noSideBtn.addEventListener('click', () => {
      setPlannedMeal(day, mealType, mealName, variantName || undefined, SIDE_NONE);
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
      if (typeof onSelected === 'function') onSelected();
      else {
        renderPlannerGrid();
        renderShoppingList();
      }
    });
    optionsEl.appendChild(noSideBtn);
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  let assignFlowState = null;

  function isMobileViewport() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
  }

  function closeAssignMealModal() {
    assignFlowState = null;
    const overlay = document.getElementById('assign-meal-overlay');
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    }
    const backBtn = document.getElementById('assign-meal-back');
    if (backBtn) backBtn.hidden = true;
  }

  function switchToPlannerTabMobile() {
    document.querySelector('.mobile-tab[data-tab="planner"]')?.click();
  }

  function renderAssignMealModal() {
    const s = assignFlowState;
    if (!s) return;
    const { meal, mealName } = s;
    const heading = document.getElementById('assign-meal-heading');
    const subtitle = document.getElementById('assign-meal-subtitle');
    const hint = document.getElementById('assign-meal-step-hint');
    const body = document.getElementById('assign-meal-body');
    const backBtn = document.getElementById('assign-meal-back');
    if (!heading || !subtitle || !hint || !body) return;
    const emoji = getMealEmoji(meal);
    subtitle.innerHTML = emoji ? `<span class="meal-emoji-display">${escapeHtml(emoji)}</span>${escapeHtml(mealName)}` : escapeHtml(mealName);
    body.innerHTML = '';
    if (s.step === 'variant') {
      heading.textContent = 'Choose option';
      hint.textContent = 'Pick which version of this meal.';
      if (backBtn) backBtn.hidden = true;
      meal.variants.forEach(v => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-block';
        btn.textContent = v.name;
        btn.addEventListener('click', () => {
          s.variantName = v.name;
          if (meal.sides && meal.sides.length > 0) s.step = 'side';
          else s.step = 'slots';
          renderAssignMealModal();
        });
        body.appendChild(btn);
      });
      return;
    }
    if (s.step === 'side') {
      heading.textContent = 'Choose side';
      hint.textContent = 'Pick a side, or skip if you do not need one.';
      if (backBtn) backBtn.hidden = !(meal.variants && meal.variants.length > 0);
      const noSideBtn = document.createElement('button');
      noSideBtn.type = 'button';
      noSideBtn.className = 'btn btn-secondary btn-block';
      noSideBtn.textContent = 'No side';
      noSideBtn.addEventListener('click', () => {
        s.sideName = SIDE_NONE;
        s.step = 'slots';
        renderAssignMealModal();
      });
      body.appendChild(noSideBtn);
      meal.sides.forEach(sd => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-block';
        btn.textContent = sd.name;
        btn.addEventListener('click', () => {
          s.sideName = sd.name;
          s.step = 'slots';
          renderAssignMealModal();
        });
        body.appendChild(btn);
      });
      return;
    }
    heading.textContent = 'Add to plan';
    hint.textContent = 'Choose a day and meal time.';
    if (backBtn) {
      const canBack = (meal.variants && meal.variants.length > 0) || (meal.sides && meal.sides.length > 0);
      backBtn.hidden = !canBack;
    }
    for (const day of DAYS) {
      for (const mealType of getSlotsForDay(day)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-block assign-slot-btn';
        btn.textContent = `${day} · ${mealType}`;
        btn.addEventListener('click', () => {
          setPlannedMeal(day, mealType, mealName, s.variantName || undefined, s.sideName || undefined);
          closeAssignMealModal();
          renderPlannerGrid();
          renderShoppingList();
          renderWeekSummary();
          if (isMobileViewport()) switchToPlannerTabMobile();
        });
        body.appendChild(btn);
      }
    }
  }

  function goBackAssignStep() {
    const s = assignFlowState;
    if (!s) return;
    const { meal } = s;
    if (s.step === 'slots') {
      if (meal.sides && meal.sides.length > 0) {
        s.step = 'side';
        s.sideName = undefined;
      } else if (meal.variants && meal.variants.length > 0) {
        s.step = 'variant';
        s.variantName = undefined;
        s.sideName = undefined;
      }
    } else if (s.step === 'side') {
      if (meal.variants && meal.variants.length > 0) {
        s.step = 'variant';
        s.variantName = undefined;
        s.sideName = undefined;
      }
    }
    renderAssignMealModal();
  }

  function openAssignMealFlow(mealName) {
    const meal = getMealByName(mealName);
    if (!meal) return;
    assignFlowState = {
      mealName,
      meal,
      variantName: undefined,
      sideName: undefined,
      step: 'slots'
    };
    if (meal.variants && meal.variants.length > 0) assignFlowState.step = 'variant';
    else if (meal.sides && meal.sides.length > 0) assignFlowState.step = 'side';
    const overlay = document.getElementById('assign-meal-overlay');
    if (!overlay) return;
    renderAssignMealModal();
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  function onMealDragStart(e) {
    const btn = e.target.closest('.planned-meal');
    if (!btn) return;
    const day = btn.dataset.day;
    const mealType = btn.dataset.mealType;
    const mealName = getPlannedMeal(day, mealType);
    const variantName = getPlannedVariant(day, mealType);
    const sideName = getPlannedSide(day, mealType);
    e.dataTransfer.setData('application/json', JSON.stringify({ mealName, variantName, sideName, fromPlan: true, day, mealType }));
    e.dataTransfer.effectAllowed = 'copyMove';
    btn.classList.add('dragging');
  }

  function onLibraryCardDragStart(e) {
    const card = e.target.closest('.meal-card');
    if (!card) return;
    const mealName = card.dataset.mealName;
    e.dataTransfer.setData('application/json', JSON.stringify({ mealName, fromPlan: false }));
    e.dataTransfer.effectAllowed = 'copyMove';
    card.classList.add('dragging');
  }

  function onMealDragEnd(e) {
    e.target.closest('.meal-card')?.classList.remove('dragging');
    e.target.closest('.planned-meal')?.classList.remove('dragging');
  }

  // --- Meal library ---
  function renderMealLibrary(shuffleOrder) {
    const container = document.getElementById('meal-library');
    if (!container) return;
    container.innerHTML = '';
    const mealsToShow = shuffleOrder ? shuffleArray(state.meals) : state.meals;
    mealsToShow.forEach(meal => {
      const card = document.createElement('div');
      card.className = 'meal-card';
      card.dataset.mealName = meal.meal_name;
      card.setAttribute('role', 'listitem');
      const hasVariants = meal.variants && meal.variants.length > 0;
      const hasSides = meal.sides && meal.sides.length > 0;
      let desc = '';
      if (hasVariants) {
        desc = 'Options: ' + meal.variants.map(v => v.name).join(', ');
      } else {
        desc = (meal.ingredients || []).join(', ');
      }
      if (hasSides) desc = (desc ? desc + ' · ' : '') + 'Sides: ' + meal.sides.map(s => s.name).join(', ');
      const emoji = getMealEmoji(meal);
      card.innerHTML = `
        <div class="meal-card-header">
          <div class="meal-name"><span class="meal-emoji-display">${emoji}</span>${escapeHtml(meal.meal_name)}${meal.quick ? ' <span class="meal-quick-icon" title="Quick meal">⚡</span>' : ''}${hasVariants ? ' <span class="meal-variant-badge">' + meal.variants.length + ' options</span>' : ''}${hasSides ? ' <span class="meal-variant-badge">' + meal.sides.length + ' sides</span>' : ''}</div>
          <div class="meal-card-actions">
            <button type="button" class="btn-icon edit-meal-btn" title="Edit">&#9998;</button>
            <button type="button" class="btn-icon delete-meal-btn" title="Delete">&times;</button>
          </div>
        </div>
        <div class="meal-ingredients">${escapeHtml(desc)}</div>
      `;
      card.querySelector('.edit-meal-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openMealModal(meal.meal_name);
      });
      card.querySelector('.delete-meal-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${meal.meal_name}"?`)) {
          removeMeal(meal.meal_name);
          renderMealLibrary();
          renderPlannerGrid();
          renderShoppingList();
        }
      });
      card.addEventListener('click', function (e) {
        if (e.target.closest('.btn-icon')) return;
        if (isMobileViewport()) {
          openAssignMealFlow(meal.meal_name);
          return;
        }
        card.classList.toggle('show-ingredients');
      });
      container.appendChild(card);
    });
    attachPlannerDragDrop();
  }

  // --- Add/Edit Meal modal ---
  function openMealModal(editMealName) {
    const overlay = document.getElementById('meal-modal-overlay');
    const title = document.getElementById('meal-modal-title');
    const nameInput = document.getElementById('meal-name');
    const ingInput = document.getElementById('meal-ingredients');
    const commonInput = document.getElementById('meal-common-ingredients');
    const variantsList = document.getElementById('meal-variants-list');
    const emojiInput = document.getElementById('meal-emoji');
    const emojiPicker = document.getElementById('meal-emoji-picker');
    if (emojiPicker) {
      emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
    }
    if (editMealName) {
      const meal = getMealByName(editMealName);
      title.textContent = 'Edit Meal';
      nameInput.value = meal ? meal.meal_name : '';
      nameInput.readOnly = true;
      const currentEmoji = meal ? getMealEmoji(meal) : '';
      if (emojiInput) emojiInput.value = currentEmoji;
      if (emojiPicker && currentEmoji) {
        emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
          if (btn.getAttribute('data-emoji') === currentEmoji) btn.classList.add('selected');
        });
      }
      if (meal && meal.variants && meal.variants.length > 0) {
        ingInput.value = '';
        commonInput.value = (meal.commonIngredients || []).join(', ');
        renderVariantsList(meal.variants);
      } else {
        ingInput.value = meal ? (meal.ingredients || []).join(', ') : '';
        commonInput.value = '';
        renderVariantsList([]);
      }
      renderSidesList(meal && meal.sides ? meal.sides : []);
      const quickCheck = document.getElementById('meal-quick');
      if (quickCheck) quickCheck.checked = !!(meal && meal.quick);
    } else {
      title.textContent = 'Add Meal';
      nameInput.value = '';
      nameInput.readOnly = false;
      ingInput.value = '';
      commonInput.value = '';
      if (emojiInput) emojiInput.value = '';
      renderVariantsList([]);
      renderSidesList([]);
      const quickCheck = document.getElementById('meal-quick');
      if (quickCheck) quickCheck.checked = false;
    }
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  function renderVariantsList(variants) {
    const container = document.getElementById('meal-variants-list');
    if (!container) return;
    container.innerHTML = '';
    (variants.length ? variants : [{ name: '', ingredients: '' }]).forEach((v, i) => {
      const block = document.createElement('div');
      block.className = 'variant-block';
      block.innerHTML = `
        <input type="text" class="variant-name" placeholder="Variant name (e.g. Beef/pork mince)" value="${escapeHtml(typeof v.name === 'string' ? v.name : '')}">
        <input type="text" class="variant-ingredients" placeholder="Ingredients for this variant (comma-separated)" value="${escapeHtml(Array.isArray(v.ingredients) ? v.ingredients.join(', ') : (v.ingredients || ''))}">
      `;
      container.appendChild(block);
    });
  }

  function collectVariantsFromForm() {
    const blocks = document.querySelectorAll('#meal-variants-list .variant-block');
    const variants = [];
    blocks.forEach(block => {
      const name = block.querySelector('.variant-name')?.value?.trim();
      const ing = block.querySelector('.variant-ingredients')?.value?.trim();
      if (name) {
        variants.push({
          name,
          ingredients: ing ? ing.split(',').map(s => s.trim()).filter(Boolean) : []
        });
      }
    });
    return variants;
  }

  function renderSidesList(sides) {
    const container = document.getElementById('meal-sides-list');
    if (!container) return;
    container.innerHTML = '';
    (sides.length ? sides : [{ name: '', ingredients: '' }]).forEach(s => {
      const block = document.createElement('div');
      block.className = 'variant-block';
      block.innerHTML = `
        <input type="text" class="side-name" placeholder="Side name (e.g. Rice, Pasta)" value="${escapeHtml(typeof s.name === 'string' ? s.name : '')}">
        <input type="text" class="side-ingredients" placeholder="Ingredients for this side (comma-separated)" value="${escapeHtml(Array.isArray(s.ingredients) ? s.ingredients.join(', ') : (s.ingredients || ''))}">
      `;
      container.appendChild(block);
    });
  }

  function collectSidesFromForm() {
    const blocks = document.querySelectorAll('#meal-sides-list .variant-block');
    const sides = [];
    blocks.forEach(block => {
      const name = block.querySelector('.side-name')?.value?.trim();
      const ing = block.querySelector('.side-ingredients')?.value?.trim();
      if (name) {
        sides.push({
          name,
          ingredients: ing ? ing.split(',').map(s => s.trim()).filter(Boolean) : []
        });
      }
    });
    return sides;
  }

  function closeMealModal() {
    const overlay = document.getElementById('meal-modal-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
  }

  function handleMealFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('meal-name');
    const ingInput = document.getElementById('meal-ingredients');
    const commonInput = document.getElementById('meal-common-ingredients');
    const name = nameInput.value.trim();
    if (!name) return;
    const variants = collectVariantsFromForm();
    const hasVariants = variants.length > 0;
    const ingredientsStr = (ingInput && ingInput.value || '').trim();
    if (!hasVariants && !ingredientsStr) {
      alert('Please add ingredients (single list) or add at least one variant with a name.');
      return;
    }
    const emojiInput = document.getElementById('meal-emoji');
    const selectedBtn = document.querySelector('#meal-emoji-picker .emoji-btn.selected');
    const emoji = (emojiInput && emojiInput.value.trim()) || (selectedBtn && selectedBtn.dataset.emoji) || '';
    const commonStr = (commonInput && commonInput.value || '').trim();
    const commonIngredients = commonStr ? commonStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const sides = collectSidesFromForm();
    const quickCheck = document.getElementById('meal-quick');
    const quick = quickCheck ? quickCheck.checked : false;
    const existing = getMealByName(name);
    if (existing) {
      if (emoji) existing.emoji = emoji; else delete existing.emoji;
      if (quick) existing.quick = true; else delete existing.quick;
      if (sides.length > 0) existing.sides = sides; else delete existing.sides;
      if (hasVariants) {
        existing.commonIngredients = commonIngredients;
        existing.variants = variants;
        delete existing.ingredients;
      } else {
        existing.ingredients = ingredientsStr ? ingredientsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        delete existing.commonIngredients;
        delete existing.variants;
      }
      saveMeals();
    } else {
      if (hasVariants) {
        addMeal(name, { commonIngredients, variants, sides: sides.length ? sides : undefined, emoji: emoji || undefined, quick: quick || undefined });
      } else {
        const meal = { meal_name: name, ingredients: ingredientsStr ? ingredientsStr.split(',').map(s => s.trim()).filter(Boolean) : [] };
        if (emoji) meal.emoji = emoji;
        if (sides.length > 0) meal.sides = sides;
        if (quick) meal.quick = true;
        state.meals.push(meal);
        saveMeals();
      }
    }
    closeMealModal();
    renderMealLibrary();
    renderPlannerGrid();
    renderShoppingList();
  }

  // --- Wizard ---
  const WIZARD_STEPS = ['wizard-step-welcome', 'wizard-step-meals', 'wizard-step-plan', 'wizard-step-done'];
  let wizardStepIndex = 0;

  function showWizardStep(index) {
    WIZARD_STEPS.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.hidden = i !== index;
    });
    wizardStepIndex = index;
    if (index === 1) renderWizardMeals();
    if (index === 2) renderWizardPlannerPreview();
  }

  function renderWizardMeals() {
    const container = document.getElementById('wizard-meals-container');
    if (!container) return;
    container.innerHTML = '';
    const addBlock = () => {
      const block = document.createElement('div');
      block.className = 'wizard-meal-block';
      block.innerHTML = `
        <label>Meal name</label>
        <input type="text" class="wizard-meal-name" placeholder="e.g. Spaghetti Bolognese">
        <label>Ingredients (comma-separated)</label>
        <input type="text" class="wizard-meal-ingredients" placeholder="e.g. spaghetti, minced beef, tinned tomatoes">
      `;
      container.appendChild(block);
    };
    addBlock();
    addBlock();
    addBlock();
    const addBtn = document.getElementById('wizard-add-meal');
    if (addBtn) addBtn.onclick = addBlock;
  }

  function collectWizardMeals() {
    const blocks = document.querySelectorAll('#wizard-meals-container .wizard-meal-block');
    const meals = [];
    blocks.forEach(block => {
      const name = block.querySelector('.wizard-meal-name')?.value?.trim();
      const ing = block.querySelector('.wizard-meal-ingredients')?.value?.trim();
      if (name) {
        meals.push({ name, ingredients: ing ? ing.split(',').map(s => s.trim()).filter(Boolean) : [] });
      }
    });
    return meals;
  }

  function renderWizardPlannerPreview() {
    const dragContainer = document.getElementById('wizard-meals-drag');
    if (dragContainer) {
      dragContainer.innerHTML = '';
      state.meals.forEach(meal => {
        const card = document.createElement('div');
        card.className = 'meal-card';
        card.dataset.mealName = meal.meal_name;
        card.setAttribute('draggable', 'true');
        const emoji = getMealEmoji(meal);
        const quickIcon = meal.quick ? ' <span class="meal-quick-icon" title="Quick meal">⚡</span>' : '';
        card.innerHTML = (emoji ? `<span class="meal-emoji-display">${escapeHtml(emoji)}</span>` : '') + escapeHtml(meal.meal_name) + quickIcon;
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ mealName: meal.meal_name }));
          e.dataTransfer.effectAllowed = 'copyMove';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        dragContainer.appendChild(card);
      });
    }
    const container = document.getElementById('wizard-planner-preview');
    if (!container) return;
    container.innerHTML = '';
    for (const day of DAYS) {
      const slots = getSlotsForDay(day);
      const col = document.createElement('div');
      col.className = 'day-col';
      col.innerHTML = `<div class="day-name">${day.slice(0, 3)}</div>`;
      for (const mealType of slots) {
        const slot = document.createElement('div');
        slot.className = 'drop-slot';
        slot.dataset.day = day;
        slot.dataset.mealType = mealType;
        const planned = getPlannedMeal(day, mealType);
        const variant = getPlannedVariant(day, mealType);
        const side = getPlannedSide(day, mealType);
        const plannedMeal = getMealByName(planned);
        const slotEmoji = plannedMeal ? getMealEmoji(plannedMeal) : '';
        let slotLabel = planned ? (variant ? `${planned} (${variant})` : planned) : mealType;
        if (planned && side && side !== SIDE_NONE) slotLabel += ' with ' + side;
        const slotQuickIcon = plannedMeal && plannedMeal.quick ? ' <span class="meal-quick-icon" title="Quick meal">⚡</span>' : '';
        slot.innerHTML = planned ? (slotEmoji ? `<span class="meal-emoji-display">${escapeHtml(slotEmoji)}</span>` : '') + escapeHtml(slotLabel) + slotQuickIcon : escapeHtml(mealType);
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', (e) => {
          e.preventDefault();
          slot.classList.remove('drag-over');
          const payload = e.dataTransfer.getData('application/json');
          if (!payload) return;
          const data = JSON.parse(payload);
          const meal = getMealByName(data.mealName);
          const hasVariants = meal && meal.variants && meal.variants.length > 0;
          const hasSides = meal && meal.sides && meal.sides.length > 0;
          const done = renderWizardPlannerPreview;
          if (hasVariants) {
            openVariantPicker(day, mealType, data.mealName, hasSides ? (variantName) => openSidePicker(day, mealType, data.mealName, variantName, done) : done);
          } else if (hasSides) {
            openSidePicker(day, mealType, data.mealName, undefined, done);
          } else {
            setPlannedMeal(day, mealType, data.mealName);
            renderWizardPlannerPreview();
          }
        });
        col.appendChild(slot);
      }
      container.appendChild(col);
    }
  }

  function wizardNext() {
    if (wizardStepIndex === 1) {
      const meals = collectWizardMeals();
      if (meals.length < 3) {
        alert('Please add at least 3 meals.');
        return;
      }
      state.meals = meals.map(m => ({ meal_name: m.name, ingredients: m.ingredients }));
      saveMeals();
      renderMealLibrary(true);
    }
    if (wizardStepIndex === 2) {
      localStorage.setItem(STORAGE_WIZARD_DONE, 'true');
      document.getElementById('wizard-overlay').setAttribute('aria-hidden', 'true');
      document.getElementById('wizard-overlay').style.display = 'none';
      renderPlannerGrid();
      renderShoppingList();
      return;
    }
    showWizardStep(wizardStepIndex + 1);
  }

  function wizardPrev() {
    if (wizardStepIndex > 0) showWizardStep(wizardStepIndex - 1);
  }

  function initWizard() {
    const overlay = document.getElementById('wizard-overlay');
    if (localStorage.getItem(STORAGE_WIZARD_DONE)) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
      return;
    }
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
    showWizardStep(0);
    document.querySelectorAll('[data-wizard-next]').forEach(btn => {
      btn.addEventListener('click', wizardNext);
    });
    document.querySelectorAll('[data-wizard-prev]').forEach(btn => {
      btn.addEventListener('click', wizardPrev);
    });
    document.getElementById('wizard-close')?.addEventListener('click', () => {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    });
  }

  // --- Init ---
  function init() {
    loadState();
    checkUrlImport();

    function finishInit() {
      initWizard();
      renderMealLibrary(true);
      renderPlannerGrid();
      renderShoppingList();
      renderRecipesList();

      wireEventListeners();
    }

    const mealsPromise = state.meals.length === 0
      ? fetch(BUNDLED_MEALS_CSV, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('bundled meals unavailable');
          return r.text();
        })
        .then(function (text) {
          importMealsFromCsv(text);
          if (state.meals.length > 0 && !localStorage.getItem(STORAGE_WIZARD_DONE)) {
            localStorage.setItem(STORAGE_WIZARD_DONE, 'true');
          }
        })
        .catch(function () { /* file missing, file://, or offline — fall through to wizard */ })
      : Promise.resolve();

    Promise.all([mealsPromise, loadBundledRecipesIfEmpty()]).finally(finishInit);
  }

  function wireEventListeners() {
    document.getElementById('add-meal-btn')?.addEventListener('click', () => openMealModal());
    document.getElementById('meal-form')?.addEventListener('submit', handleMealFormSubmit);
    document.getElementById('meal-modal-cancel')?.addEventListener('click', closeMealModal);
    document.querySelectorAll('#meal-emoji-picker .emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#meal-emoji-picker .emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const input = document.getElementById('meal-emoji');
        if (input) input.value = btn.getAttribute('data-emoji') || '';
      });
    });
    document.getElementById('meal-emoji')?.addEventListener('input', function () {
      document.querySelectorAll('#meal-emoji-picker .emoji-btn').forEach(b => b.classList.remove('selected'));
    });
    document.getElementById('add-variant-btn')?.addEventListener('click', () => {
      const container = document.getElementById('meal-variants-list');
      if (!container) return;
      const block = document.createElement('div');
      block.className = 'variant-block';
      block.innerHTML = `
        <input type="text" class="variant-name" placeholder="Variant name (e.g. Beef/pork mince)">
        <input type="text" class="variant-ingredients" placeholder="Ingredients for this variant (comma-separated)">
      `;
      container.appendChild(block);
    });
    document.getElementById('add-side-btn')?.addEventListener('click', () => {
      const container = document.getElementById('meal-sides-list');
      if (!container) return;
      const block = document.createElement('div');
      block.className = 'variant-block';
      block.innerHTML = `
        <input type="text" class="side-name" placeholder="Side name (e.g. Rice, Pasta)">
        <input type="text" class="side-ingredients" placeholder="Ingredients for this side (comma-separated)">
      `;
      container.appendChild(block);
    });
    document.getElementById('variant-picker-cancel')?.addEventListener('click', () => {
      document.getElementById('variant-picker-overlay').setAttribute('aria-hidden', 'true');
      document.getElementById('variant-picker-overlay').style.display = 'none';
    });
    document.getElementById('side-picker-cancel')?.addEventListener('click', () => {
      document.getElementById('side-picker-overlay').setAttribute('aria-hidden', 'true');
      document.getElementById('side-picker-overlay').style.display = 'none';
    });
    document.getElementById('assign-meal-cancel')?.addEventListener('click', closeAssignMealModal);
    document.getElementById('assign-meal-back')?.addEventListener('click', goBackAssignStep);
    document.getElementById('assign-meal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'assign-meal-overlay') closeAssignMealModal();
    });

    document.getElementById('import-meals-btn')?.addEventListener('click', () => document.getElementById('import-meals-input').click());
    document.getElementById('import-meals-input')?.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        importMealsFromCsv(reader.result);
        renderMealLibrary();
        renderPlannerGrid();
        renderShoppingList();
      };
      reader.readAsText(file);
      this.value = '';
    });

    document.getElementById('export-meals-btn')?.addEventListener('click', () => {
      downloadCsv(mealsToCsv(), 'meals.csv');
    });
    document.getElementById('export-plan-btn')?.addEventListener('click', () => {
      downloadCsv(planToCsv(), 'plan.csv');
    });
    document.getElementById('random-fill-btn')?.addEventListener('click', autoFillWeek);
    document.getElementById('clear-plan-btn')?.addEventListener('click', clearPlan);

    document.getElementById('restore-shopping-btn')?.addEventListener('click', () => {
      shoppingRemoved.clear();
      renderShoppingList();
    });
    document.getElementById('copy-shopping-btn')?.addEventListener('click', copyShoppingToClipboard);
    document.getElementById('export-shopping-btn')?.addEventListener('click', exportShoppingCsv);

    document.getElementById('share-btn')?.addEventListener('click', openShareModal);
    document.getElementById('share-close-btn')?.addEventListener('click', closeShareModal);
    document.getElementById('share-download-btn')?.addEventListener('click', downloadPlanFile);
    document.getElementById('share-copy-link-btn')?.addEventListener('click', copyShareLink);
    document.getElementById('share-native-btn')?.addEventListener('click', nativeShare);
    document.getElementById('import-plan-btn')?.addEventListener('click', () => document.getElementById('import-plan-input').click());
    document.getElementById('import-plan-input')?.addEventListener('change', handleImportPlanFile);

    document.getElementById('recipes-btn')?.addEventListener('click', () => showAppPanel('recipes'));
    document.getElementById('close-recipes-btn')?.addEventListener('click', () => showAppPanel('planner'));
    document.getElementById('add-recipe-btn')?.addEventListener('click', openRecipeModal);
    document.getElementById('recipe-modal-cancel')?.addEventListener('click', closeRecipeModal);
    document.getElementById('save-recipe-json-btn')?.addEventListener('click', saveRecipeFromTextarea);
    document.getElementById('copy-recipe-prompt-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(buildRecipePrompt()).then(() => {
        const toast = document.getElementById('recipe-prompt-copied');
        if (toast) {
          toast.hidden = false;
          setTimeout(() => { toast.hidden = true; }, 1800);
        }
      }).catch(() => {});
    });
    document.getElementById('recipe-search')?.addEventListener('input', () => {
      activeRecipeId = null;
      renderRecipesList();
    });
    document.getElementById('recipe-category-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.recipe-category-chip');
      if (!btn) return;
      activeRecipeCategory = btn.dataset.category || 'all';
      activeRecipeId = null;
      renderRecipesList();
    });
    document.getElementById('recipes-list')?.addEventListener('click', (e) => {
      const card = e.target.closest('.recipe-card');
      if (card) renderRecipeDetail(card.dataset.recipeId);
    });
    document.getElementById('recipe-detail')?.addEventListener('click', (e) => {
      if (e.target.closest('#back-to-recipes-btn')) {
        activeRecipeId = null;
        renderRecipesList();
      }
      if (e.target.closest('#copy-recipe-to-meal-btn')) copyRecipeToMeal(activeRecipeId);
    });
    document.getElementById('recipe-detail')?.addEventListener('input', (e) => {
      if (e.target.id !== 'recipe-notes-input' || !activeRecipeId) return;
      const recipe = getRecipeById(activeRecipeId);
      if (!recipe) return;
      recipe.notes = e.target.value;
      saveRecipes();
    });
    document.getElementById('import-recipes-btn')?.addEventListener('click', () => document.getElementById('import-recipes-input').click());
    document.getElementById('import-recipes-input')?.addEventListener('change', importRecipesFile);
    document.getElementById('export-recipes-btn')?.addEventListener('click', exportRecipesJson);

    initMobileTabs();
  }

  function openShareModal() {
    const overlay = document.getElementById('share-overlay');
    const qrContainer = document.getElementById('share-qr-container');
    const qrFallback = document.getElementById('share-qr-fallback');
    const nativeBtn = document.getElementById('share-native-btn');
    if (!overlay || !qrContainer) return;
    qrContainer.innerHTML = '';
    qrFallback.hidden = true;
    const ok = generateQR(qrContainer);
    if (!ok) qrFallback.hidden = false;
    if (nativeBtn) {
      const file = new File([exportFullState()], 'meal-plan.json', { type: 'application/json' });
      nativeBtn.hidden = !(navigator.share && navigator.canShare && navigator.canShare({ files: [file], title: 'Meal Plan' }));
    }
    overlay.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'flex';
  }

  function closeShareModal() {
    const overlay = document.getElementById('share-overlay');
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    }
  }

  function downloadPlanFile() {
    const json = exportFullState();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meal-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyShareLink() {
    const url = getShareUrl();
    const toast = document.getElementById('share-copied-toast');
    navigator.clipboard.writeText(url).then(() => {
      if (toast) {
        toast.hidden = false;
        clearTimeout(window._shareCopyToastTimer);
        window._shareCopyToastTimer = setTimeout(() => { toast.hidden = true; }, 2000);
      }
    }).catch(() => {});
  }

  function nativeShare() {
    const json = exportFullState();
    const file = new File([json], 'meal-plan.json', { type: 'application/json' });
    if (navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Meal Plan', text: 'Shared meal plan' }).catch(() => {});
    }
  }

  function handleImportPlanFile(e) {
    const input = e.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm('This will replace your current plan. Continue?')) return;
      if (importFullState(reader.result)) {
        renderMealLibrary();
        renderPlannerGrid();
        renderShoppingList();
        renderRecipes();
      } else {
        alert('Could not import: invalid plan file.');
      }
    };
    reader.readAsText(file);
  }

  function showAppPanel(name) {
    const panels = {
      planner: document.querySelector('.planner'),
      sidebar: document.querySelector('.sidebar'),
      recipes: document.querySelector('.recipes-panel'),
      shopping: document.querySelector('.shopping-panel')
    };
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) panel.classList.toggle('mobile-visible', key === name);
    });
    document.querySelectorAll('.mobile-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    if (name === 'recipes') renderRecipes();
  }

  function initMobileTabs() {
    const tabs = document.querySelectorAll('.mobile-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => showAppPanel(tab.dataset.tab));
    });
    showAppPanel('planner');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
