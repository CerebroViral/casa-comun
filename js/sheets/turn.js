// One turn of La Rueda: mark it done, ask for a swap (Cambiar turno), or hand it to someone else.
import { h, icon, avatar, openSheet, sheetHeader, toast } from '../ui.js';
import { rpc } from '../data.js';
import { friendlyError } from '../supabase-client.js';
import { capitalise, weekdayName, weekdayIndex, addDays } from '../periods.js';
import { roleLabel, upcomingKitchenTurns, upcomingTaskTurns, ROLE_TASK } from '../rueda.js';

export function turnTitle(turn) {
  if (turn.role === ROLE_TASK) return `${turn.task?.name ?? 'Tarea'} · semana del ${dayMonth(turn.date)}`;
  return `${capitalise(weekdayName(weekdayIndex(turn.date)))} ${dayMonth(turn.date)} · ${roleLabel(turn.role)}`;
}

export function dayMonth(day) {
  const [, m, d] = day.split('-');
  return `${Number(d)}-${m}`;
}

// "el sábado (limpiar la cocina)" / "la semana del 12-10 (baño completo)"
export function turnPhrase(turn, today) {
  if (turn.role === ROLE_TASK) return `la semana del ${dayMonth(turn.date)} (${roleLabel(turn.role, turn.task)})`;
  const sameWeek = turn.date >= today && turn.date <= addDays(today, 6);
  const day = weekdayName(weekdayIndex(turn.date));
  return `el ${day}${sameWeek ? '' : ` ${dayMonth(turn.date)}`} (${roleLabel(turn.role)})`;
}

export function openTurnSheet(ctx, turn) {
  const member = ctx.member(turn.member_id);
  const mine = turn.member_id === ctx.me?.id;
  const future = turn.role === ROLE_TASK ? addDays(turn.date, 6) >= ctx.today : turn.date >= ctx.today;
  openSheet((close) => {
    const action = (iconName, label, fn) => h('button', { type: 'button', class: 'action-item', onclick: fn }, icon(iconName, { size: 22 }), label);
    const others = h('div', { class: 'choice-pills', hidden: true },
      ctx.rota.settings.participants.map((id) => ctx.member(id)).filter((m) => m && m.id !== turn.member_id).map((m) => h('button', {
        type: 'button', class: 'choice-pill',
        onclick: async () => {
          try {
            await rpc('reassign_chore', { p_household: ctx.v.household.id, p_date: turn.date, p_role: turn.role, p_task_id: turn.task?.id ?? null, p_member: m.id });
            await ctx.refresh();
            toast(`Ahora le toca a ${m.display_name}.`);
            close();
          } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
        },
      }, m.display_name)));
    return [
      sheetHeader({ eyebrow: 'La Rueda', title: turnTitle(turn), close }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        avatar(member, { size: 40 }),
        h('div', null, h('div', { style: { fontWeight: 700, fontSize: '16px' } }, member?.display_name ?? '—'),
          h('div', { class: 'row-sub' }, turn.done ? 'Hecho' : 'Le toca', turn.source === 'swap' ? ' · por un cambio' : turn.source === 'manual' ? ' · cambiado a mano' : ''))),
      h('div', { class: 'action-list' },
        action(turn.done ? 'close' : 'check', turn.done ? 'Quitar «hecho»' : 'Marcar como hecho', () => {
          ctx.mutate('chore.done', {
            household_id: ctx.v.household.id, date: turn.date, role: turn.role, task_id: turn.task?.id ?? null,
            member_id: turn.member_id, done: !turn.done, done_by: ctx.me?.id,
          });
          close();
        }),
        mine && future ? action('swap', 'Pedir un cambio de turno', () => { close(); openSwapSheet(ctx, turn); }) : null,
        future ? action('edit', 'Lo hace otra persona', () => { others.hidden = !others.hidden; }) : null),
      others,
    ];
  }, { label: turnTitle(turn) });
}

// Cambiar turno: pick the person, then one of their turns to exchange, or "Hazme el favor".
export function openSwapSheet(ctx, turn) {
  const people = ctx.rota.settings.participants.map((id) => ctx.member(id))
    .filter((m) => m && m.id !== ctx.me?.id && m.kind === 'adult' && m.user_id);
  let to = null;
  let exchange = null;
  openSheet((close) => {
    const theirTurns = h('div', { class: 'stack', hidden: true });
    const error = h('div', { class: 'form-error', role: 'alert' });
    const drawTurns = () => {
      if (!to) { theirTurns.hidden = true; return; }
      const done = ctx.rueda.done ?? [];
      const turns = turn.role === ROLE_TASK
        ? upcomingTaskTurns(ctx.rota, to, ctx.today, { weeks: 4 }).filter((t) => addDays(t.date, 6) >= ctx.today)
        : upcomingKitchenTurns(ctx.rota, to, ctx.today, { days: 21, done });
      const options = [{ key: 'favor', label: 'Hazme el favor (sin cambiar nada a cambio)', value: null },
        ...turns.slice(0, 8).map((t) => ({ key: `${t.date}|${t.role}|${t.task_id}`, label: `A cambio de ${turnPhrase(t, ctx.today)}`, value: t }))];
      theirTurns.hidden = false;
      theirTurns.replaceChildren(h('div', { class: 'field-label' }, `¿Y tú qué le haces a ${ctx.member(to).display_name}?`),
        h('div', { class: 'stack', role: 'radiogroup', 'aria-label': 'Qué le ofreces' }, options.map((o) => h('label', { class: 'check-line' },
          h('input', { type: 'radio', name: 'swap-exchange', class: 'check', checked: (exchange === null && !o.value) || (exchange && o.value && o.key === `${exchange.date}|${exchange.role}|${exchange.task_id}`), onchange: () => { exchange = o.value; } }),
          o.label))));
    };
    const pills = h('div', { class: 'choice-pills', role: 'radiogroup', 'aria-label': '¿Con quién?' });
    const drawPills = () => pills.replaceChildren(...people.map((m) => h('button', {
      type: 'button', role: 'radio', class: 'choice-pill', 'aria-checked': String(m.id === to),
      onclick: () => { to = m.id; exchange = null; drawPills(); drawTurns(); },
    }, m.display_name)));
    drawPills();
    const send = h('button', {
      type: 'button', class: 'btn btn-primary btn-block btn-big',
      onclick: async () => {
        if (!to) { error.textContent = 'Elige a quién se lo pides.'; return; }
        send.disabled = true;
        try {
          await rpc('request_swap', {
            p_household: ctx.v.household.id, p_date: turn.date, p_role: turn.role, p_task_id: turn.task?.id ?? null, p_to_member: to,
            p_exchange_date: exchange?.date ?? null, p_exchange_role: exchange?.role ?? null, p_exchange_task_id: exchange?.task_id ?? null,
          });
          await ctx.refresh();
          toast(`Petición enviada a ${ctx.member(to).display_name}.`);
          close();
        } catch (e) {
          send.disabled = false;
          error.textContent = friendlyError(e);
        }
      },
    }, 'Enviar petición');
    return [
      sheetHeader({ eyebrow: 'Cambiar turno', title: capitalise(turnPhrase(turn, ctx.today)), close }),
      people.length ? h('div', { class: 'sheet-section' }, h('div', { class: 'field-label' }, '¿A quién se lo pides?'), pills)
        : h('div', { class: 'empty' }, 'No hay nadie más en la Rueda con cuenta.'),
      theirTurns,
      h('div', { class: 'caption' }, 'Solo cambia ese día. La Rueda sigue igual las demás semanas.'),
      error,
      people.length ? send : null,
    ];
  }, { label: 'Cambiar turno' });
}

export function swapCard(ctx, swap) {
  const from = ctx.member(swap.from_member);
  const task = swap.task_id ? (ctx.rueda.tasks ?? []).find((t) => t.id === swap.task_id) : null;
  const exTask = swap.exchange_task_id ? (ctx.rueda.tasks ?? []).find((t) => t.id === swap.exchange_task_id) : null;
  const ask = turnPhrase({ date: swap.date, role: swap.role, task }, ctx.today);
  const give = swap.exchange_date ? turnPhrase({ date: swap.exchange_date, role: swap.exchange_role, task: exTask }, ctx.today) : null;
  const answer = (accept) => async () => {
    try {
      const r = await rpc('respond_swap', { p_swap_id: swap.id, p_accept: accept });
      await ctx.refresh();
      toast(r?.status === 'expired' ? 'Esa petición ya ha caducado.' : accept ? 'Cambio aceptado.' : 'Le has dicho que no puedes.');
    } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
  };
  return h('section', { class: 'card swap-card', 'aria-label': 'Petición de cambio' },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, avatar(from, { size: 36 }),
      h('div', { style: { fontSize: '15px' } }, h('strong', null, from?.display_name ?? 'Alguien'), ` te pide cambiar ${ask}`,
        give ? `. A cambio, te hace ${give}.` : '.')),
    h('div', { class: 'two-buttons' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: answer(true) }, 'Aceptar'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: answer(false) }, 'No puedo')));
}

