# Approved mockups — Casa Común

Static mockups (390×844 phone screens) approved by Jorge on 16-10-2026. Each `.dc.html` is a self-contained
HTML page; the inline styles are the exact design (colours, fonts, sizes, spacing, copy). `canvas.json`
only stores their position on the design canvas. The `support.js` they reference is the design editor's
runtime and is not included — read the markup, do not try to run it.

| File | Screen |
| --- | --- |
| `Main.dc.html` | Lista de la compra |
| `Comprado.dc.html` | Marcar como comprado (bottom sheet) |
| `Cuentas.dc.html` | Cuentas del mes |
| `Cierre.dc.html` | Cierre de mes |
| `Casa.dc.html` | Casa y perfil (each person edits their own name and colour) |
| `Rueda.dc.html` | La Rueda · Cocina (who cooks / cleans the kitchen each day) |
| `Tareas.dc.html` | La Rueda · Limpieza (weekly tasks + 4-week rotation) |
| `Planificador.dc.html` | Planificador de recetas (Phase 2) — the nav bar belongs at the bottom |
| `Menu.dc.html` | Menú semanal with cost and calories (Phase 2) |
| `Receta.dc.html` | Receta with cost and calories per portion (Phase 2) |

The bottom bar has **5 tabs** (Lista, Cuentas, Rueda, Recetas, Casa) on every main screen.
`cuadro-tareas-referencia.jpg` is the family's current paper chart that La Rueda replaces (reference only).
All prices, calories, names and dishes in the mockups are **sample data** (the Rueda names come from the
family's paper chart, but in the app every name comes from the members' own profiles). Names in brackets
(`[Esposa]`, `[Su nombre]`…) are placeholders: real names are set by each person in the app.

Design tokens:
- Background `#F2F4F3`, surface `#FFFFFF`, ink `#1B2420`, muted text `#5B6660`, lines `#ECEFED`
- Accent (actions) `#C2410C`; info blue `#1F5F7A` / tint `#E1EEF3` / text `#174A5F`
- Positive `#1F7A4D` / tint `#E2F2E9`; negative `#B42318` / tint `#FCE7E5`; personal tag `#9A3412`
- Member colours: `#1F5F7A`, `#9A3412`, `#4D5B2A`, `#6B3F7A`, `#A3245A`, `#3B4540`
- Fonts: Bricolage Grotesque 600/700 (headings, big numbers), Figtree 400–700 (everything else)
- Radii: cards 14–18 px, buttons 12–16 px, pills 999 px
