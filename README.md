# Casa Común

App para la casa: lista de la compra compartida, cuentas del mes entre los 4 adultos, **La Rueda**
(turnos de cocina y limpieza) y recetas con presupuesto y calorías. By SophieNexus · © 2026 Todos los derechos reservados.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
| --- | --- |
| `CLAUDE.md` | Las reglas del proyecto. Claude Code lo lee solo al abrir la carpeta. |
| `docs/SPEC.md` | Qué hace la app, pantalla por pantalla, y las fases. |
| `docs/DATA-MODEL.md` | La base de datos y la seguridad (para Claude Code). |
| `docs/RECIPES-AI.md` | Cómo se calculan menús, precios y calorías (Fase 2). |
| `docs/disenos/` | Los 10 diseños aprobados. |
| `docs/PROMPT-INICIAL.md` | El mensaje que pegas en Claude Code para empezar. |
| `docs/SETUP.md` | **Cómo ponerla en marcha**: Supabase, GitHub Pages, instalar en móviles y el APK. |
| `docs/capturas/` | Capturas de todas las pantallas a 360 y 390 px junto a los diseños (`index.html`). |
| `index.html`, `css/`, `js/`, `assets/`, `sw.js`, `manifest.webmanifest` | La app (sin compilar: se publica tal cual). |
| `config.js` | Dirección de Supabase y su clave pública. Nada secreto. |
| `supabase/` | La base de datos: `schema.sql` (todo), `migrations/`, y sus pruebas. |
| `tests/` | Pruebas: unitarias, de extremo a extremo (360 y 390 px) y un Supabase local para probar. |

## Cómo empezar (paso a paso)

1. Abre VS Code → **Archivo → Abrir carpeta** → elige `E:\DocumentoJorge\AI\CasaComun`.
2. Abre Claude Code en esa carpeta.
3. Copia el texto de `docs/PROMPT-INICIAL.md` (lo que hay entre las dos rayas) y pégalo.
4. Claude Code construirá la **Fase 1** (lista, compras, cuentas, cierre de mes y La Rueda) y te dirá qué tienes que
   pulsar en Supabase y GitHub. Cuando te mande el informe, me lo pasas y lo revisamos juntos.

## Lo que vas a necesitar

- **Supabase** (la base de datos). Ojo: el plan gratis permite **2 proyectos activos** y probablemente ya
  los tienes ocupados con Vimeca y ElsiAlisados. Opción sencilla y gratis: crear una cuenta de Supabase con
  otro correo (por ejemplo, un Gmail de la casa). Claude Code te lo preguntará antes de crear nada.
- **GitHub** (donde se publica la app): la misma cuenta de SophieNexus que usas para Vimeca.
- **Fase 2 (recetas):** una clave de la API de Anthropic con saldo. El uso de una familia cuesta céntimos o
  pocos euros al mes, y la app tiene un límite diario para que no se dispare.

## Cómo la instalará cada uno

- **Android:** un APK que generaremos con PWABuilder (te dará un archivo de firma: guárdalo como oro,
  hace falta para cada actualización).
- **iPhone:** abrir el enlace en Safari → Compartir → "Añadir a pantalla de inicio". Sin App Store.

## Fases

1. **Compra, cuentas y La Rueda** — lo que más vais a usar. Primero esta. Al crear La Rueda,
   metéis vuestro cuadro de turnos tal cual lo tenéis en papel (o la app lo genera sola).
2. **Recetas** con presupuesto, precios de Mercadona y Dia y calorías por ración (adulto y niña).
3. **Extras** — foto del ticket, despensa, estadísticas y avisos.

Diseños online: https://claude.ai/artifact/S185zThKhszLxPiSdmKHuw
