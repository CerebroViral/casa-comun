# Casa Común · Cómo ponerla en marcha

Guía paso a paso para Jorge. No hace falta saber programar: solo copiar, pegar y pulsar botones.
Lo que está entre `comillas así` es exactamente lo que tienes que escribir o buscar en pantalla.

> **Nunca** me pases ni subas a GitHub: la contraseña de la base de datos, la clave `service_role` / `secret`
> de Supabase, ni el archivo de firma del APK (`signing.keystore`) ni sus contraseñas. Guárdalos en tu gestor
> de contraseñas. Lo único que se puede compartir es la **dirección del proyecto** y la clave **pública**
> (`anon` / `publishable`).

---

## 1. Base de datos (Supabase, cuenta nueva)

1. Entra en <https://supabase.com> → `Start your project` → crea la cuenta con el **correo nuevo**
   (por ejemplo, el Gmail de la casa).
2. Pulsa `New project`:
   - **Name:** `casa-comun`
   - **Database Password:** pulsa `Generate a password` y **guárdala en tu gestor de contraseñas**. No me la pases.
   - **Region:** `Central EU (Frankfurt)`
   - **Plan:** `Free`
   - Pulsa `Create new project` y espera un par de minutos.
3. Crear las tablas:
   - Menú de la izquierda → `SQL Editor` → `New query`.
   - En VS Code abre el archivo `supabase/schema.sql`, selecciona todo (`Ctrl + A`), copia (`Ctrl + C`).
   - Pégalo en Supabase (`Ctrl + V`) y pulsa `Run` (abajo a la derecha).
   - Tiene que salir `Success. No rows returned`. Si sale un error rojo, hazle una captura y pásamela.
   - Se puede ejecutar más de una vez sin romper nada.
4. Entrar sin confirmar el correo (es una app familiar):
   - `Authentication` → `Sign In / Providers` → `Email` → desactiva `Confirm email` → `Save`.
5. Para que funcione "He olvidado la contraseña":
   - `Authentication` → `URL Configuration`.
   - **Site URL:** `https://cerebroviral.github.io/casa-comun/` → `Save`.
   - **Redirect URLs** → `Add URL` → `https://cerebroviral.github.io/casa-comun/` → `Save`.
6. Copia estas dos cosas y pásamelas por el chat (son públicas, no pasa nada):
   - `Project Settings` (la rueda dentada) → `Data API` → **Project URL** (`https://xxxx.supabase.co`).
   - `Project Settings` → `API Keys` → la clave **anon public** (o **publishable**).
   - **No** copies la que se llama `service_role` ni `secret`.

Yo la pongo en `config.js`, compruebo la seguridad con dos usuarios de prueba en dos casas
(`npm run test:rls-live`) y te digo si está todo bien.

> Supabase gratis pausa un proyecto si nadie lo usa en una semana. Usándola a diario no pasa; si un día
> se pausa, en Supabase sale un botón `Restore` y en un par de minutos vuelve a funcionar, con los datos intactos.

---

## 2. Publicar la app (GitHub Pages, cuenta CerebroViral)

1. Entra en <https://github.com> con la cuenta **CerebroViral**.
2. Arriba a la derecha `+` → `New repository`:
   - **Repository name:** `casa-comun`
   - **Public**
   - No marques nada más (sin README, sin .gitignore, sin licencia).
   - `Create repository`.
3. Dime "creado". Yo subo los archivos desde tu ordenador: **te saldrá una ventana de GitHub para iniciar
   sesión** → `Sign in with your browser` → `Authorize`. Solo la primera vez.
4. Activar la web:
   - En el repositorio → `Settings` → `Pages` (menú de la izquierda).
   - **Source:** `Deploy from a branch`.
   - **Branch:** `main` y carpeta `/ (root)` → `Save`.
   - En 1–2 minutos estará en **<https://cerebroviral.github.io/casa-comun/>**.

---

## 3. Instalarla en los móviles

**iPhone (Safari):** abre el enlace en **Safari** → botón `Compartir` (cuadrado con flecha) →
`Añadir a pantalla de inicio` → `Añadir`.

**Android:** con el APK del paso 4, o mientras tanto desde Chrome: menú `⋮` → `Instalar aplicación`.

Dentro de la app, en `Casa` → `Cómo instalar la app` están los mismos pasos para el resto de la familia.

**Primer uso:** cada persona crea su cuenta con su correo. La primera crea la casa (`Crear casa`); en
`Casa` aparece el **código para unirse** y el botón `Compartir por WhatsApp`. Los demás eligen
`Unirme con código`. Cada uno pone su nombre y su color. La niña se añade desde `Casa` → `Añadir niño o niña`.

---

## 4. APK de Android con PWABuilder

1. Entra en <https://www.pwabuilder.com>, pega `https://cerebroviral.github.io/casa-comun/` y pulsa `Start`.
2. Pulsa `Package For Stores` → en **Android** pulsa `Generate Package`.
3. Rellena (lo demás déjalo como está):
   - **Package ID:** `io.github.cerebroviral.casacomun`
   - **App name:** `Casa Común` · **Short name:** `Casa Común`
   - **Signing key:** `Create new` (PWABuilder crea la clave de firma).
   - Pulsa `Download Package`.
4. Descomprime el ZIP. Dentro hay:
   - `*.apk` → el archivo para instalar en los Android de casa.
   - `*.aab` → solo haría falta para Google Play (no lo usamos).
   - `signing.keystore` y `signing-key-info.txt` → **esto es secreto**. Guárdalo en tu gestor de
     contraseñas o en un sitio seguro. **Sin él no se puede actualizar la app nunca más.** No me lo pases
     ni lo subas a GitHub.
   - `assetlinks.json` → este sí me lo puedes pasar (solo lleva la "huella" pública del certificado).
5. Pásame el `assetlinks.json` (o la línea `SHA-256` de `signing-key-info.txt`). Yo lo pongo en la web para
   que la app se abra a pantalla completa, sin la barra del navegador.
6. Para instalar el APK en un Android: mándalo por WhatsApp o Drive, ábrelo en el móvil y acepta
   `Permitir instalar aplicaciones de esta fuente`.

**Detalle técnico importante (lo hago yo):** Android comprueba la huella en
`https://cerebroviral.github.io/.well-known/assetlinks.json`, es decir, en la **raíz** del dominio, que en
GitHub es otro repositorio llamado `CerebroViral.github.io`. Si ese repositorio no existe, te pediré que lo crees
igual que el paso 2 (vacío y público) y yo subo ahí el archivo. Mientras tanto el APK funciona igual,
solo que se ve una barra fina con la dirección arriba.

---

## 5. Actualizaciones

Cada vez que cambie la app, subo la versión nueva a GitHub y cambio el número `cc-app-N` en `sw.js` para que
los móviles se actualicen solos la próxima vez que abran la app (a veces hay que cerrarla del todo y
volver a abrirla). El APK no hace falta volver a generarlo para cambios normales: carga la web.

---

## Para quien programe (no hace falta para Jorge)

- Sin paso de compilación: HTML/CSS/JS (módulos ES). Supabase JS y las fuentes van en el repositorio
  (`vendor/`, `assets/fonts/`); se regeneran con `npm install && node scripts/vendor.mjs`.
- `npm test` → pruebas unitarias (reparto al céntimo, Bizums, importes en español, meses en Madrid,
  La Rueda) y de base de datos (el `schema.sql` real en PGlite: RLS con dos usuarios en dos casas, triggers, RPCs).
- `npx playwright test` → E2E en Chromium a 360×780 y 390×844 contra la app local y un doble local de
  Supabase (`tests/support/fake-supabase.mjs`: Postgres real con el mismo esquema y RLS).
- `node scripts/screenshots.mjs` → capturas de todas las pantallas en `docs/capturas/` junto a los diseños.
- `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run test:rls-live` → RLS contra el proyecto real (crea 2 usuarios de prueba).
- `node tests/support/dev-server.mjs --fake` → la app en <http://127.0.0.1:4173> con datos locales.
- Esquema: `supabase/schema.sql` (estado completo) y `supabase/migrations/` (pasos). Fase 2 añadirá sus tablas
  en una migración nueva.
- Para otra casa u otra familia: la misma web sirve para cualquier número de casas (cada una con su código).
  Para un despliegue propio: nuevo proyecto Supabase + `schema.sql` + cambiar `config.js`.
