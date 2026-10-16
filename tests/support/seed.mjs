// Builds a realistic test household through the real RPCs (4 adults + 1 child, a shopping list, purchases
// and La Rueda). Test data only — used for E2E tests and screenshots, never shipped.
import { createClient } from '@supabase/supabase-js';

export const PASSWORD = 'secreto-de-prueba';
const PEOPLE = [
  { name: 'Jorge', color: '#1F5F7A' },
  { name: 'Elena', color: '#9A3412' },
  { name: 'Hugo', color: '#4D5B2A' },
  { name: 'Carla', color: '#6B3F7A' },
];

function client(url, anonKey) {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ok(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${error.message} ${error.details ?? ''}`);
  return data;
}

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function seedHousehold({ url, anonKey, tag = String(Date.now()), withRueda = true, withPurchases = true }) {
  const users = [];
  for (const p of PEOPLE) {
    const c = client(url, anonKey);
    const email = `${p.name.toLowerCase()}.${tag}@prueba.es`;
    await ok(c.auth.signUp({ email, password: PASSWORD }));
    users.push({ ...p, email, password: PASSWORD, c });
  }
  const [jorge, elena, hugo, carla] = users;
  const created = await ok(jorge.c.rpc('create_household', { p_name: 'Casa de Madrid', p_display_name: 'Jorge', p_color: jorge.color }));
  const hid = created.household_id;
  const { invite_code: code } = await ok(jorge.c.from('households').select('invite_code').eq('id', hid).single());
  for (const u of [elena, hugo, carla]) await ok(u.c.rpc('join_household', { p_code: code, p_display_name: u.name, p_color: u.color }));
  const members = await ok(jorge.c.from('members').select('*').eq('household_id', hid).order('created_at'));
  for (const u of users) u.memberId = members.find((m) => m.display_name === u.name).id;
  await ok(jorge.c.rpc('add_child', { p_household: hid, p_display_name: 'Sofía', p_color: '#A3245A', p_child_label: 'niña' }));

  const item = async (u, name, extra = {}) => {
    const id = crypto.randomUUID();
    await ok(u.c.from('shopping_items').insert({ id, client_id: id, household_id: hid, name, ...extra }));
    return id;
  };
  await item(elena, 'Leche semidesnatada', { quantity_text: '6 L', estimated_cents: 570, category: 'Lácteos y huevos' });
  await item(jorge, 'Huevos L', { quantity_text: '2 docenas', estimated_cents: 520, category: 'Lácteos y huevos' });
  const pan = await item(hugo, 'Pan de molde', { estimated_cents: 145, category: 'Panadería' });
  await item(carla, 'Arroz redondo', { quantity_text: '2 kg', estimated_cents: 260, category: 'Despensa' });
  await item(jorge, 'Aceite de oliva', { quantity_text: '1 L', estimated_cents: 890, category: 'Despensa' });
  await item(jorge, 'Café molido', { quantity_text: '250 g', estimated_cents: 390, category: 'Despensa', scope: 'personal', for_member_id: jorge.memberId });
  await item(elena, 'Tomates', { quantity_text: '1 kg', estimated_cents: 210, category: 'Fruta y verdura' });
  await item(carla, 'Pechugas de pollo', { quantity_text: '1 kg', estimated_cents: 720, category: 'Carne y pescado' });
  await item(hugo, 'Detergente', { estimated_cents: 650, category: 'Limpieza y hogar' });
  await item(elena, 'Plátanos', { quantity_text: '1 kg', category: 'Fruta y verdura', list: 'urgent' });
  await item(jorge, 'Papel higiénico', { quantity_text: '12 rollos', estimated_cents: 450, category: 'Higiene', list: 'urgent' });

  if (withPurchases) {
    const today = new Date();
    const daysAgo = (n) => new Date(today.getTime() - n * 86400000).toISOString();
    const buy = (u, amount, description, store, when) => ok(u.c.rpc('add_purchase', {
      p_household: hid, p_description: description, p_amount_cents: amount, p_paid_by: u.memberId, p_store: store,
      p_scope: 'common', p_client_id: crypto.randomUUID(), p_purchased_at: when,
    }));
    await buy(elena, 1430, 'Fruta y verdura', 'Mercadona', daysAgo(4));
    await buy(elena, 1070, 'Carne picada', 'Mercadona', daysAgo(3));
    await buy(jorge, 7442, 'Compra semanal', 'Mercadona', daysAgo(2));
    await buy(hugo, 3855, 'Pescado', 'Dia', daysAgo(2));
    await ok(hugo.c.rpc('mark_item_bought', {
      p_item_id: pan, p_amount_cents: 145, p_paid_by: hugo.memberId, p_store: 'Dia', p_scope: 'common',
      p_client_id: crypto.randomUUID(), p_for_member_id: null, p_purchased_at: daysAgo(1),
    }));
    await buy(jorge, 558, 'Leche semidesnatada', 'Mercadona', today.toISOString());
  }

  if (withRueda) {
    const p = users.map((u) => u.memberId);
    const template = Array.from({ length: 7 }, (_, d) => ({ weekday: d, cook_member: p[d % 4], cleaner_member: p[(d + 1) % 4] }));
    await ok(jorge.c.rpc('save_rueda_setup', {
      p_household: hid,
      p_settings: { start_date: mondayOf(new Date()), participants: p, rotate_kitchen: true, batch_weekday: 6, cleaning_weekday: 5 },
      p_template: template,
      p_tasks: [
        { name: 'Baño completo', icon: 'bath' }, { name: 'Suelos y salón', icon: 'broom' },
        { name: 'Polvo y superficies', icon: 'sparkle' }, { name: 'Basura y reciclaje', icon: 'trash' },
        { name: 'Ir a la compra', icon: 'cart', links_to: 'shopping' },
      ],
    }));
    const rules = [
      ['Cocinar', 'Una persona cocina cada noche para todos.'],
      ['Limpiar después de cocinar', 'Otra persona se encarga de la cocina.'],
      ['Habitaciones', 'Cada uno mantiene la suya limpia y ordenada.'],
      ['Compra', 'Pagamos a partes iguales y nos turnamos para ir.'],
      ['Días de descanso', 'Si no puedes cumplir tu turno, cámbialo con otra persona.'],
      ['Rotación', 'Al terminar el ciclo, volvemos a empezar o ajustamos según la carga de trabajo.'],
    ].map(([title, body], i) => ({ household_id: hid, title, body, sort: i }));
    await ok(jorge.c.from('house_rules').insert(rules));
  }
  return { householdId: hid, code, users, members };
}
