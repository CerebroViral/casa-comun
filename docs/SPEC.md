# Casa Común — functional spec

Mockup file for each screen in brackets, under `docs/disenos/`. Visible copy below is in Spanish exactly as
it should appear; where the mockup and this spec differ, **this spec wins on behaviour, the mockup wins on
look**.

---

## 1. People, accounts and the household

- Sign up / log in with **email + password** (Supabase Auth). No email confirmation step (family use);
  password reset by email is available.
- After the first login a person either **creates a household** ("Crear casa", gives it a name) or
  **joins one** with an invite code ("Unirme con código"). The code is 6 characters, uppercase,
  no ambiguous letters (no O/0/I/1), shown on the Casa screen with a "Compartir por WhatsApp" button
  (`https://wa.me/?text=…` with the app URL and the code). Any adult can regenerate it.
- **Members** (`members` table) can be:
  - an **adult with an account** — `kind='adult'`, `portion_factor=1`, `shares_costs=true` by default;
  - a **child without an account** — added by any adult from the Casa screen, `kind='child'`,
    `portion_factor=0.5`, `shares_costs=false` by default. Children never log in.
- **Each person personalises their own profile** [Casa]: display name (1–24 chars) and colour (6 swatches
  from the mockup). The avatar is the initial on that colour. A person can only edit their own profile;
  children's profiles can be edited by any adult. Names are never hard-coded anywhere.
- No visible text explains that children do not pay. The rule just applies (see §4). The Casa list shows
  `Adulto` or `Niña`/`Niño` + `media ración` (child label chosen when adding the child: niña/niño).
- Settings on the Casa screen: invite code, "Mostrar calorías" switch (Phase 2, default on), stores
  (default `Mercadona`, `Dia`, plus `Otro`), "Cerrar sesión". Advanced (collapsed, any adult):
  who shares costs (switch per member) — default 4 adults.

## 2. Shopping list [Main]

- Two tabs: **Compra del mes** (`list='monthly'`) and **Hace falta ya** (`list='urgent'`), each with its count
  of pending items.
- Summary card on the monthly tab: `Estimado de la compra del mes ≈ X €` and the pill `Y € / adulto`
  (X ÷ number of members with `shares_costs`). Phase 1: X = sum of the estimated prices typed by users
  (items without a price are not counted and the card says `n productos sin precio`). Phase 2: estimates
  come from the catalogue / learned prices automatically. Subtitle `Precios Mercadona y Dia · estimados`.
- Items grouped by category (fixed list, Spanish): Fruta y verdura, Carne y pescado, Lácteos y huevos,
  Panadería, Despensa, Congelados, Bebidas, Limpieza y hogar, Higiene, Otros. Category is suggested from the
  name (simple keyword map) and editable.
- Each row: tick box, name, quantity text + `añadido por {nombre}`, estimated price `≈ 5,70 €` (optional),
  tag **Común** (green) or **Personal** (terracotta; subtitle `solo para {nombre}`).
- **Añadir producto** (floating button) opens a sheet: name (with autocomplete from frequent items and,
  in Phase 2, the catalogue), quantity (free text), list (mes / ya), Común/Personal (personal → for whom,
  default me), estimated price (optional), category. "Frecuentes" chips: the 12 items most often added in this
  household, one tap to add.
- Ticking an item opens **Marcar como comprado** (§3). Bought items stay visible, struck through, with
  `Comprado por {nombre} · {tienda}` and the real price, until the month is closed or someone taps
  "Limpiar comprados".
- Swipe or long-press → edit / move to the other list / delete (confirm). Deleting a bought item never deletes
  its purchase; that is done from Cuentas.
- Realtime: changes by others appear within seconds. Offline: everything here works offline (queue).
- Footer `By SophieNexus · © 2026 Todos los derechos reservados` at the end of the list.

## 3. Mark as bought [Comprado]

Bottom sheet:
- `¿Cuánto costó?` big numeric input (Spanish decimal comma accepted, `5,58`), required unless the item is
  Personal (then optional).
- `¿Quién lo pagó?` member grid (adults with accounts), default = me.
- `¿Dónde?` Mercadona / Dia / Otro (from settings), default = last used.
- `¿Para quién es?` **Común (se reparte)** / **Personal**, pre-filled from the item.
- Info line, only for Común: `Se suma a las cuentas de {mes}: {pagador} adelanta X € y cada adulto pone Y €.`
- **Guardar compra** → creates a `purchases` row linked to the item and marks the item bought, atomically
  (RPC `mark_item_bought`). If someone else already marked it bought: `{nombre} ya lo compró` and no duplicate.
- Purchases can also be added without a list item from Cuentas: "Añadir gasto" (description, amount, payer,
  store, common/personal, date) — e.g. the big end-of-month shop, marked **Compra grande**.

## 4. Monthly accounts [Cuentas] and the split rule

Period = calendar month (`YYYY-MM`) of the household, Europe/Madrid time zone. Only **Común** purchases
count. Personal purchases are listed for information and never enter the split.

**Split, to the cent:**
- `P` = members with `shares_costs=true` (the 4 adults), ordered by `members.created_at`.
- `C` = sum of common purchases of the period, in cents.
- Share of each: `floor(C / |P|)`; the remainder `C mod |P|` cents is given +1 cent each to the first
  members in order. The shares always add up exactly to `C`.
- `paid_i` = sum of common purchases paid by member i. `balance_i = paid_i − share_i`.
  Positive (green, `+43,75 €`) = has put in more; negative (red, `−11,25 €`) = still owes. Text and sign,
  never colour alone. Caption: `En verde: lleva puesto de más. En rojo: le falta por poner. Se ajusta en el cierre.`

Cuentas screen: header `Cuentas de {mes}` + `Gastos comunes · solo comida`; dark card with
`Adelantado este mes` (C) and `Parte de cada adulto` (C/|P|, shown rounded), caption
`Entre 4 adultos a partes iguales` (the number is the real count); per member row with bar
(paid_i relative to the max), `adelantó X €` and balance; `Últimas compras` (latest 3, "Ver todas");
button **Preparar cierre de mes**.

## 5. Month closing [Cierre]

Two moments, same screen:

1. **Before the big shop** (no purchase marked Compra grande yet): shows the estimate of the big shop
   (the monthly list estimate) and, for each adult, `Pone para la compra grande ≈ share'_i − paid_i`, where
   share' is computed on `C + estimate`. Lets the family pool money before going. Clearly labelled as estimate.
2. **After the big shop** (its real amount entered as a common purchase, `is_big_shop=true`): the exact
   breakdown as in the mockup:
   - `Compras durante el mes` (common purchases not big shop), `Compra grande de fin de mes`,
     `Gasto común total`, pill `Parte de cada adulto: {C} € ÷ {n} = {share} €`.
   - Per adult: `{share} − {paid before big shop} ya adelantado` → **amount to put in**.
   - **Transfers (Bizum) to settle:** computed from final balances with the greedy rule (largest debtor pays
     largest creditor, repeat) — minimum number of transfers, amounts in cents. Each transfer is a chip
     `{deudor} → {importe}` with a "Marcar pagado" action (any adult; records who and when).
   - **Cerrar {mes} y empezar {mes siguiente}** (confirm dialog). Closing freezes the period: its purchases
     can no longer be edited, a snapshot (shares, paid, balances, transfers) is stored, bought items of the
     monthly list are cleared, and the next period opens. Unpaid transfers stay visible in history.
   - Any adult can **reopen** the last closed period (confirm, logged) if a mistake is found.
- `Ver meses anteriores`: list of closed months (total, each person's share, transfers and their state).

## 5b. La Rueda — house chores rota (Phase 1) [Rueda, Tareas]

Fifth tab in the bottom bar, between Cuentas and Recetas: **Lista · Cuentas · Rueda · Recetas · Casa**
(icon: two circular arrows). Header `La Rueda` + `Turnos de la casa · semana {k} de {n}`, week arrows
(past and future weeks). Three segments: **Cocina**, **Limpieza**, **Normas**.

**Who takes part:** members with `in_chores=true` (default: the adults), in an order the household sets.
`n` = number of participants = length of the rotation cycle in weeks (4 people → 4 weeks).
Week index `k = (floor(days since start_date / 7) mod n) + 1`, weeks Monday–Sunday.

**Setup ("Crear la Rueda", first time, any adult):** participants and their order, start Monday, and the
kitchen week either **entered by hand** (grid 7 days × Cocina/Limpia, like the family's paper chart) or
**"Generar automático"**. The family will type their own chart in; nothing is hard-coded.

**Cocina [Rueda]:**
- Per day two roles: **Cocina** — dinner for everyone + next day's lunches (copy:
  `Cena para los {N} + almuerzos de mañana`, N = people eating) — and **Limpia la cocina** (sink, worktop,
  hob, utensils). Rule: the same person never has both roles the same day (validated in the editor).
- Base = the kitchen template (week 1). If `rotate_kitchen` (default on), in week k every person in the
  template is replaced by the person `k−1` places later in the participants order, so everyone gets every
  day over the cycle. Automatic generation: day d of the cycle (0…7n−1) → cook `p[d mod n]`,
  cleaner `p[(d+1) mod n]` — each person cooks 7 times and cleans 7 times per cycle.
- The **batch day** (default Sunday) shows the tag `para la semana`: that cook prepares food for the week.
- Today card (dark): `HOY · {DÍA}`, cook and cleaner with avatars; in Phase 2, if a menu exists, the dinner
  of that day (`Pollo al horno con patatas`), tapping opens the recipe.
- Info strip for the current user: `Tu próximo turno: {día}, {cocinar|limpiar la cocina}` + **Cambiar**.
- Week table: Día | Cocina | Limpia with member chips (member colour tint + name, text contrast ≥ 4.5:1);
  today's row highlighted; a ✓ in the chip when done. Tap a chip: mark done (the assigned person or any adult)
  or ask for a swap.

**Limpieza [Tareas]:**
- Weekly tasks, defaults (editable: add, rename, reorder, remove, pick an icon from a small set):
  Baño completo, Suelos y salón, Polvo y superficies, Basura y reciclaje, **Ir a la compra**.
- Assignment: task t in week w → `p[(t + w) mod n]` (Latin square, everyone does each task once per cycle),
  unless the household edits the grid by hand.
- Note card from settings: `El sábado, 30–45 min entre todos. La basura, cuando haga falta.`
  (day and text editable).
- Each task: assigned chip + done box. "Ir a la compra" links to the Lista: the Lista header shows
  `Esta semana va a la compra: {nombre}`.
- `ROTACIÓN DE {n} SEMANAS` grid (weeks × tasks) with the current week outlined, and the caption
  `Al terminar la semana {n}, la rueda vuelve a empezar.`

**Cambiar turno (swaps):** from my turn → `Cambiar turno` sheet: pick the person, optionally pick one of
their turns to exchange (or "Hazme el favor" with no exchange). The other person sees a badge on the Rueda tab
and a card `Gabriel te pide cambiar el sábado (limpiar la cocina)` with **Aceptar / No puedo**. Accepted →
an override for that date only; the base rotation never changes. Unanswered requests expire when the turn
date passes. Any adult can also reassign a single day manually (logged).

**Normas:** editable list of house rules (any adult; add, edit, reorder, delete). On setup offer these
suggestions, each can be kept or discarded: Cocinar (una persona cocina cada noche para todos), Limpiar
después de cocinar (otra persona se encarga de la cocina), Habitaciones (cada uno mantiene la suya
limpia y ordenada), Compra (pagamos a partes iguales y nos turnamos para ir), Días de descanso (si no
puedes cumplir tu turno, cámbialo con otra persona), Rotación (al terminar el ciclo, volvemos a empezar o
ajustamos según la carga de trabajo). Footer line: `Entre todos es más fácil y más justo.`

No points, rankings or shaming: the Rueda only shows who does what and what is done.
Phase 3: push reminder `Hoy te toca cocinar` (time configurable, default 17:00).

## 6. Recipes with budget (Phase 2) [Planificador, Menu, Receta]

Full behaviour, data sources and the AI contract are in `docs/RECIPES-AI.md`. Screens:
- **Planificador:** `Una comida` / `Semana` / `Mes`; meals Comidas / Cenas / Desayunos; adults and children
  steppers (default = household members; children = media ración); budget slider with `≈ X € por ración`
  (budget ÷ (portions × meals)); preferences chips (Menos de 30 min, Aprovechar sobras, Cocinar el domingo,
  Sin picante, + Alergias o no nos gusta… free text, remembered per household); stores; **Crear menú**.
  The bottom navigation bar sits at the bottom on every screen.
- **Menú:** total estimated cost vs budget with bar (`Te sobran X €` or `Te pasas X €`), average
  `≈ N kcal/día por adulto` (comida + cena, when calories are on); days with each meal: name,
  `≈ N kcal/ración · niña ≈ M` (child = portion_factor × adult), cost; leftover tags
  (`Aprovecha el pollo del lunes`); caption `Calorías estimadas según cantidades y tablas oficiales de
  alimentos`; **Añadir N ingredientes a la lista** (merges with existing items, skips what is marked as
  already at home) and **Proponer otro menú**. Swap a single dish from its row menu ("Cambiar este plato").
- **Receta:** title, 4 tiles `Coste`, `Ración` (+ `niña X €`), `Tiempo`, `Kcal/ración` (+ `niña ≈ M`);
  ingredients with quantity, store and price source (`estimado` / `precio de vuestro ticket`), kcal per
  ingredient, "Ya lo tenéis en casa" toggle; numbered steps; **Añadir lo que falta a la lista (n)**.
- All calorie figures hidden when "Mostrar calorías" is off. Small note on Receta:
  `Estimación orientativa, no es consejo nutricional.`

## 7. Offline, sync and realtime

- App shell cached by the service worker (cache name `cc-app-<n>`, bump on every release).
- Local store (IndexedDB): household snapshot (members, open items, current period purchases) + mutation
  queue. Every mutation has a client UUID so retries are idempotent (`client_id` unique on the server).
- On reconnect the queue is flushed in order. A banner shows `Sin conexión · 2 cambios pendientes` /
  `Sincronizado`.
- Conflicts: last write wins per row, except `mark_item_bought`, which the server refuses if already bought
  (the user sees who bought it and the local purchase is discarded with a notice — never silently).
- Realtime subscriptions on `shopping_items`, `purchases`, `members`, `transfers` filtered by household.

## 8. Packaging

- PWA manifest: name `Casa Común`, short name `Casa Común`, theme `#C2410C`, background `#F2F4F3`,
  icons 192/512 + maskable (a simple original house + basket icon in the palette; Jorge approves it).
- iPhone: `apple-touch-icon`, `apple-mobile-web-app-capable`; an in-app help screen
  "Cómo instalar" with steps for Safari (Compartir → Añadir a pantalla de inicio) and Android.
- Android APK: generated with PWABuilder from the live URL (Trusted Web Activity). Commit
  `.well-known/assetlinks.json` with the SHA-256 fingerprint PWABuilder gives, so the app opens full screen.
  Document the exact steps for Jorge in the report. The signing key file PWABuilder produces is a secret:
  never commit it; tell Jorge to keep it safe (needed for every update).

## 9. Quality bar

- Unit tests (plain JS test runner, no framework needed) for: split with remainders (C not divisible by n,
  0 €, single payer, everyone paid equally), greedy transfers, period boundaries in Europe/Madrid,
  Spanish money parsing (`5,58`, `5.58`, `1.234,50`), and in Phase 2 cost and kcal calculation.
- E2E (Playwright, Chromium at 360×780 and 390×844) for: sign up → create house → second user joins with code
  → add item → mark bought offline → reconnect → both see it → close month → history.
- Screenshots of every screen at 360 and 390 px compared side by side with the mockups in the report.
- RLS tests: a user of house A can never read or write house B (run as two real users).
