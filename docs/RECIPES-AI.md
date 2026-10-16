# Casa Común — menu planner, prices and calories (Phase 2)

Principle: **the AI proposes dishes and quantities; the app computes cost and calories** from documented data.
The model never decides a price or a calorie figure that is shown as fact.

## 1. Ingredient catalogue (`catalog_items`)

Build `supabase/seed/catalog_items.csv` with the ~200 most common ingredients of Spanish home cooking
(produce, meat, fish, eggs, dairy, pulses, rice, pasta, bread, oils, tins, frozen, spices).

- **Calories** (`kcal_per_100g`, `edible_fraction`): from **BEDCA** (Base de Datos Española de Composición de
  Alimentos, bedca.net) or, if an item is missing there, **USDA FoodData Central** (public domain). Store the
  source in `kcal_source` (e.g. `BEDCA`, `USDA FDC 171477`). Use the raw / as-purchased value and the edible
  fraction (e.g. chicken thighs with bone ≈ 0.7, bananas ≈ 0.65). If you cannot find a reliable value,
  leave it `null` and set `needs_review=true`. Never estimate silently.
- **Reference prices** (`ref_price_*`): compiled **by hand** from the public prices of Mercadona and Dia for
  a standard pack, with the date checked (`ref_price_date`). No automated scraping of supermarket sites.
  Unverified → `null`. These are shown as `estimado`.
- `unit`, `grams_per_unit` (e.g. egg L ≈ 63 g, lemon ≈ 120 g) and `density` (oil 0.92) let the app turn
  "2 limones" or "4 cucharadas" into grams. Spoon conversions: cucharada 15 ml, cucharadita 5 ml.
- Jorge reviews the CSV before seeding (report how many rows have `needs_review`).

## 2. Learned prices (`household_prices`)

When a purchase is linked to a catalogue item (via the list item autocomplete), store price per kg/l/unit.
Price used for estimates, in order: **median of the household's last 3 prices for that item and store** →
reference price → `null`. Shown as `precio de vuestro ticket` or `estimado`.

## 3. Calculations (one JS module + tests, used by the Edge Function and the app)

- `portions = Σ portion_factor` of the people eating (4 adults + 1 child = 4.5).
- Ingredient grams are for the whole dish. `kcal_i = grams_i × edible_fraction × kcal_per_100g / 100`.
- `kcal_total = Σ kcal_i` (skip `null`, and add a warning `Algún ingrediente sin datos de calorías`).
- `kcal_per_portion (adult) = round(kcal_total / portions)`; child = `round(adult × portion_factor)`.
- Recipe cost = cost of the quantity used: `price_per_g × grams_i` (pantry staples like oil and spices are
  costed the same way). The shopping list instead estimates **whole packs** to buy.
- Per-portion cost likewise; child = adult × portion_factor.
- Daily average on Menú = (Σ adult kcal_per_portion of the day's planned meals) averaged over days.
- Display rounding: kcal to the nearest 5 under 1.000 and to the nearest 10 above; euros to the cent.

## 4. Edge Function `plan-menu`

Input (from the Planificador): `{ kind, meals, adults, children, budget_cents, preferences, exclusions,
stores, swap?: {recipe_id} }`.

1. Check membership and the daily cap (`ai_usage`, default 20 calls per household per day).
2. Build the prompt with: the request, the allowed catalogue (`id, name_es` only — compact list), the
   household's exclusions/allergies, and the rules: Spanish home cooking, realistic grams for `portions`
   people, reuse leftovers when asked, vary proteins across the week, prefer seasonal produce, no dish
   repeated within a week, every ingredient from the catalogue when possible.
3. Call the Anthropic Messages API with **structured output via a tool / JSON schema**:
   `recipes[]: {day_index, meal, title, minutes, ingredients[]: {catalog_id|null, name, grams, qty_text},
   steps[], leftover_from_day?}`. Model from env `RECIPES_MODEL`, default `claude-haiku-4-5-20251001`
   (cheap and fast); `max_tokens` sized for a week. Key from secret `ANTHROPIC_API_KEY`.
4. Compute cost and kcal with §3. If the total exceeds the budget, ask the model **once** to cheapen the
   most expensive dishes, recompute; if still over, return it with `Te pasas X €`.
5. `kind='month'` = 4 week calls in sequence, passing the previous weeks' titles to avoid repetition.
6. Persist `meal_plans`, `recipes`, `recipe_ingredients`; return them.
- Ingredients outside the catalogue are allowed but get `price_source/kcal_source='none'` and show
  `sin datos` (no AI-guessed numbers in Phase 2).
- **Privacy:** never send names, emails or any personal data to the API — only counts, budget and food
  preferences. Mention the Anthropic API in the privacy text ("para generar menús").
- Validate the model output against the schema; on failure retry once, then show
  `No hemos podido crear el menú. Inténtalo de nuevo.`
- Log token usage in `ai_usage` so Jorge can see the monthly cost.

## 5. "Añadir ingredientes a la lista"

Aggregate the plan's ingredients by catalogue item (sum grams → whole packs), skip `at_home`, merge with
pending list items of the same catalogue item (update quantity text, do not duplicate), list = monthly,
scope = common, estimated price = packs × price.
