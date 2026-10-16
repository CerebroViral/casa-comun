// Copies third-party browser files into the repo so the app never loads anything from a CDN at runtime.
// Run after `npm install`: node scripts/vendor.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const p = (rel) => new URL(rel, root);

mkdirSync(p('vendor/'), { recursive: true });
mkdirSync(p('assets/fonts/'), { recursive: true });

const sbPkg = JSON.parse(readFileSync(p('node_modules/@supabase/supabase-js/package.json')));
copyFileSync(p('node_modules/@supabase/supabase-js/dist/umd/supabase.js'), p('vendor/supabase.js'));
writeFileSync(p('vendor/VERSIONS.txt'),
  `@supabase/supabase-js ${sbPkg.version} (MIT) — dist/umd/supabase.js\n`);

const fonts = [
  ['figtree', 'figtree-latin-400-normal.woff2'],
  ['figtree', 'figtree-latin-500-normal.woff2'],
  ['figtree', 'figtree-latin-600-normal.woff2'],
  ['figtree', 'figtree-latin-700-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-600-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-700-normal.woff2'],
];
for (const [pkg, file] of fonts) {
  copyFileSync(p(`node_modules/@fontsource/${pkg}/files/${file}`), p(`assets/fonts/${file}`));
}
copyFileSync(p('node_modules/@fontsource/figtree/LICENSE'), p('assets/fonts/LICENSE-Figtree-OFL.txt'));
copyFileSync(p('node_modules/@fontsource/bricolage-grotesque/LICENSE'), p('assets/fonts/LICENSE-BricolageGrotesque-OFL.txt'));
console.log('Vendored supabase-js', sbPkg.version, 'and', fonts.length, 'font files');
