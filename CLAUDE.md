# Casa Común — household shopping, shared costs, chores rota and budget recipes

Family app for one shared home in Madrid: 4 adults and 1 small child. Built by **SophieNexus**. Owner: Jorge.
It must later be replicable for other homes (other families, shared flats), so nothing is hard-coded to this family.

Read these before writing code, in this order:
1. `docs/SPEC.md` — what the app does, screen by screen, and the phases.
2. `docs/DATA-MODEL.md` — database, security rules and server functions.
3. `docs/RECIPES-AI.md` — menu planner, prices and calories (Phase 2).
4. `docs/disenos/` — the **approved mockups** (10 screens). Match them.

## Golden rules

1. **Match the approved mockups.** `docs/disenos/*.dc.html` are the source of truth for layout, colours,
   typography, spacing and copy. Do not redesign. Where a mockup shows sample data (prices, names, dishes),
   that data is illustrative only — never ship it as real data.
2. **Vanilla PWA, no framework.** Plain HTML/CSS/JS (ES modules), no build step, deployable on GitHub Pages.
   Supabase through its JS client, vendored in the repo (no runtime CDN) so the app works offline.
   Fonts (Bricolage Grotesque, Figtree) self-hosted as woff2 under `assets/fonts/`.
3. **Works with poor signal.** People use the list inside supermarkets. Adding, ticking and marking items as
   bought must work offline and sync later through a local queue (IndexedDB). Tell the user plainly when
   something is waiting to sync. Never lose an entry: local data is cleared only after the server confirms.
4. **Money is integer cents.** Never floats for money. Shares are split exactly to the cent (see SPEC §4).
5. **Never invent data.** Prices and calories come from documented sources (RECIPES-AI.md). If a value is
   unknown, store `null`, mark it, and show "sin datos" — never a made-up number. Every price or calorie
   figure shown to the user is labelled as an estimate where it is one.
6. Code, comments, identifiers and file names in **English**. All visible text in **Spanish (Spain)**,
   formatted with `Intl` `es-ES`: `5,58 €`, `1.120 kcal`, `Lunes 13-10-2026`, months in Spanish.
7. Discreet footer on the Lista screen, the Casa screen and the login screen:
   `By SophieNexus · © 2026 Todos los derechos reservados`. Nothing else in the footer.
8. **Secrets never in the repo or the client.** Supabase `service_role` key, database password and
   `ANTHROPIC_API_KEY` live only in Supabase secrets / Jorge's password manager. Only the Supabase URL and
   anon key go in `config.js`. `.env*` and any `*secret*`/`*pass*` file are gitignored.
9. **Pilot first.** Work in this repo, test on phones at 360 px and 390 px width, then deploy. Report to Jorge
   in **Spanish, short and non-technical**, with screenshots and exactly what he must click or paste.
10. Accessible: real buttons/inputs/labels, touch targets ≥ 44 px, text contrast ≥ 4.5:1, never colour alone
    (balances use colour **and** a +/− sign).

## Stack and delivery

| Piece | Choice |
| --- | --- |
| App | Vanilla PWA (HTML/CSS/JS modules), service worker, IndexedDB queue |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions), region EU (Frankfurt) |
| Hosting | GitHub Pages, repo `casa-comun` on the SophieNexus GitHub account |
| Android | APK generated from the hosted PWA with PWABuilder (Trusted Web Activity) + `/.well-known/assetlinks.json` |
| iPhone | Same PWA, installed from Safari → "Añadir a pantalla de inicio" (no App Store) |
| Recipes AI | Supabase Edge Function calling the Anthropic API (Phase 2) |

## Phases (build in this order; Jorge approves each one before the next)

- **Phase 1 — Compra, cuentas y La Rueda:** accounts, household + invite code, profiles (each person sets
  their own name and colour), shopping list, mark as bought, monthly accounts, month closing with transfers,
  history, **La Rueda** (cooking and cleaning rota, swaps, house rules), offline + realtime, PWA + APK.
- **Phase 2 — Recetas:** ingredient catalogue (prices + calories), planner, weekly/monthly menu, recipe
  detail with cost and calories per portion (adult and child), "añadir ingredientes a la lista", price
  learning from the family's own purchases.
- **Phase 3 — Extras:** ticket photo that reads the amount, pantry ("qué tenemos en casa"), spending stats,
  push notifications.
