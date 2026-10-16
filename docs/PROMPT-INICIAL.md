# Mensaje para pegar en Claude Code (Fase 1)

Abre Claude Code dentro de la carpeta `CasaComun` y pega esto:

---

Read CLAUDE.md, then docs/SPEC.md, docs/DATA-MODEL.md and the mockups in docs/disenos/ (open each .dc.html
and read its markup: the inline styles are the exact design). docs/RECIPES-AI.md is Phase 2 — read it now
only so the Phase 1 schema leaves room for it, do not build it yet.

Build **Phase 1 — Compra, cuentas y La Rueda** of Casa Común:

1. Create the repo structure (vanilla PWA, no build step): index.html, css/, js/ (ES modules), assets/fonts,
   assets/icons, sw.js, manifest.webmanifest, config.js (Supabase URL + anon key only), supabase/ (schema.sql,
   migrations/, tests), tests/ (unit + e2e), docs/SETUP.md.
2. Supabase: schema, RLS, triggers and RPCs exactly as in DATA-MODEL.md (Phase 1 tables only, Phase 2
   tables can wait). Give me the SQL to run and tell me step by step where to click in Supabase.
   Before that, check with me: my free Supabase account may already have 2 active free projects
   (Vimeca and ElsiAlisados). If so, tell me the options and wait for my choice.
3. Screens: login/sign-up, crear casa / unirme con código, Lista, Marcar como comprado, Añadir producto,
   Cuentas, Cierre de mes (both moments), meses anteriores, Casa (perfil with own name and colour,
   members, add child, invite code, settings), La Rueda (setup, Cocina, Limpieza, Normas, Cambiar turno —
   SPEC §5b). Bottom navigation with 5 tabs at the bottom on every screen.
   Match the mockups exactly; sample data in the mockups is not real data.
4. Offline queue + realtime + service worker as in SPEC §7.
5. Tests: unit (split to the cent, transfers, money parsing, periods, Rueda assignments over a full cycle:
   cook ≠ cleaner, everyone gets each task once per cycle, overrides and swaps) and E2E at 360 and 390 px, plus RLS
   tests with two users in two houses. Screenshots of every screen next to its mockup.
6. Deploy to GitHub Pages (repo `casa-comun` on the SophieNexus account) and write docs/SETUP.md.
7. Prepare the Android APK steps with PWABuilder and the assetlinks.json (I will do the PWABuilder part
   with your instructions). Never commit signing keys or secrets.

Report to me in Spanish, short and for a non-technical person: what works, screenshots, what I must click or
paste (Supabase SQL, GitHub), and the live link. Then stop and wait for my OK before Phase 2.
