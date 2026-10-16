// Read helpers over the current view snapshot, handed to every screen as `ctx`.
import { currentPeriod } from './replay.js';
import { madridDate, madridMonth } from './periods.js';

export const DEFAULT_STORES = ['Mercadona', 'Dia'];

export function makeContext(state, extra) {
  const v = state.view;
  const members = (v.members ?? []).filter((m) => m.active !== false);
  const byId = new Map((v.members ?? []).map((m) => [m.id, m]));
  const me = byId.get(v.me_id) ?? null;
  const period = currentPeriod(v);
  const settings = v.household?.settings ?? {};
  const rueda = v.rueda ?? {};
  const rota = rueda.settings
    ? { settings: rueda.settings, template: rueda.template ?? [], tasks: rueda.tasks ?? [], grid: rueda.grid ?? [], overrides: rueda.overrides ?? [] }
    : null;
  return {
    state,
    v,
    me,
    members,
    member: (id) => byId.get(id) ?? null,
    name: (id) => byId.get(id)?.display_name ?? 'Alguien',
    adults: members.filter((m) => m.kind === 'adult' && m.user_id),
    sharers: members.filter((m) => m.shares_costs),
    stores: Array.isArray(settings.stores) && settings.stores.length ? settings.stores : DEFAULT_STORES,
    showCalories: settings.show_calories !== false,
    period,
    month: period?.month ?? madridMonth(),
    today: madridDate(),
    rota,
    rueda,
    online: state.online,
    ...extra,
  };
}
