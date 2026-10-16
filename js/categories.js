// Fixed shopping categories (SPEC §2) and a simple keyword map to suggest one from the item name.

export const CATEGORIES = [
  'Fruta y verdura', 'Carne y pescado', 'Lácteos y huevos', 'Panadería', 'Despensa',
  'Congelados', 'Bebidas', 'Limpieza y hogar', 'Higiene', 'Otros',
];

const KEYWORDS = {
  'Fruta y verdura': ['manzana', 'pera', 'platano', 'naranja', 'mandarina', 'limon', 'fresa', 'uva', 'melon',
    'sandia', 'kiwi', 'melocoton', 'pina', 'aguacate', 'tomate', 'lechuga', 'cebolla', 'ajo', 'patata', 'zanahoria',
    'pimiento', 'calabacin', 'berenjena', 'pepino', 'espinaca', 'brocoli', 'coliflor', 'judia verde', 'puerro',
    'champinon', 'seta', 'calabaza', 'fruta', 'verdura', 'perejil', 'cilantro', 'jengibre', 'boniato', 'acelga'],
  'Carne y pescado': ['pollo', 'pavo', 'ternera', 'cerdo', 'lomo', 'filete', 'carne', 'chuleta', 'hamburguesa',
    'salchicha', 'chorizo', 'jamon', 'bacon', 'pescado', 'merluza', 'salmon', 'atun fresco', 'bacalao', 'gamba',
    'langostino', 'calamar', 'sepia', 'mejillon', 'dorada', 'lubina', 'sardina', 'boqueron', 'pechuga', 'muslo',
    'conejo', 'cordero', 'morcilla', 'fiambre'],
  'Lácteos y huevos': ['leche', 'yogur', 'queso', 'mantequilla', 'nata', 'huevo', 'kefir', 'requeson', 'cuajada',
    'batido', 'natillas', 'flan'],
  'Panadería': ['pan', 'baguette', 'barra', 'molde', 'tostada', 'biscote', 'croissant', 'magdalena', 'bolleria',
    'galleta', 'bizcocho', 'tortilla de trigo'],
  'Despensa': ['arroz', 'pasta', 'macarron', 'espagueti', 'fideo', 'harina', 'azucar', 'sal', 'aceite', 'vinagre',
    'lenteja', 'garbanzo', 'alubia', 'judia', 'atun', 'sardinas en lata', 'conserva', 'tomate frito', 'cafe', 'te',
    'infusion', 'cacao', 'cereal', 'avena', 'especia', 'pimienta', 'oregano', 'caldo', 'legumbre', 'mermelada',
    'miel', 'chocolate', 'frutos secos', 'nuez', 'almendra', 'aceituna', 'mayonesa', 'ketchup', 'mostaza', 'quinoa',
    'cuscus', 'levadura', 'pure'],
  'Congelados': ['congelad*', 'helado', 'pizza', 'guisantes', 'croqueta', 'empanadilla', 'varitas', 'hielo'],
  'Bebidas': ['agua', 'zumo', 'refresco', 'cola', 'cerveza', 'vino', 'gaseosa', 'tonica', 'bebida', 'sidra',
    'isotonica', 'leche de avena', 'bebida de soja'],
  'Limpieza y hogar': ['lejia', 'detergente', 'suavizante', 'friegasuelos', 'lavavajillas', 'fairy', 'estropajo',
    'bayeta', 'fregona', 'bolsa de basura', 'bolsas basura', 'papel de cocina', 'papel aluminio', 'film',
    'servilleta', 'limpiador', 'amoniaco', 'pastilla', 'ambientador', 'pila', 'bombilla', 'insecticida'],
  'Higiene': ['papel higienico', 'champu', 'gel', 'jabon', 'pasta de dientes', 'dentifrico', 'cepillo', 'desodorante',
    'compresa', 'tampon', 'panal', 'toallita', 'crema', 'colonia', 'maquinilla', 'cuchilla', 'algodon', 'bastoncillo',
    'colutorio', 'protector solar', 'mascarilla'],
};

// Accent-free lower case, so "Plátano" matches "platano".
export function normalise(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

// Whole words (plurals allowed; a trailing * means prefix). The longest keyword wins, so "leche de avena"
// goes to Bebidas and "pasta de dientes" to Higiene.
export function suggestCategory(name) {
  const n = normalise(name);
  if (!n) return 'Otros';
  let best = null;
  let bestLen = 0;
  for (const [category, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      const prefix = w.endsWith('*');
      const word = prefix ? w.slice(0, -1) : w;
      const re = new RegExp(`(^|[^a-z])${word}${prefix ? '' : '(s|es)?(?![a-z])'}`);
      if (word.length > bestLen && re.test(n)) {
        best = category;
        bestLen = word.length;
      }
    }
  }
  return best ?? 'Otros';
}
