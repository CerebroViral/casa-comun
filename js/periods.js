// Calendar helpers. Months and days are always Europe/Madrid, whatever the phone's time zone.

export const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const monthNameFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' });
const shortDayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Date (instant) → 'YYYY-MM-DD' as seen in Madrid.
export function madridDate(instant = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Date (instant) → 'YYYY-MM' as seen in Madrid. Same rule as SQL public.madrid_month().
export function madridMonth(instant = new Date()) {
  return madridDate(instant).slice(0, 7);
}

export function nextMonth(month) {
  let [y, m] = month.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function prevMonth(month) {
  let [y, m] = month.split('-').map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

// '2026-10' → 'octubre'; with year → 'octubre de 2026'.
export function monthName(month, { year = false } = {}) {
  const [y, m] = month.split('-').map(Number);
  const name = monthNameFmt.format(new Date(Date.UTC(y, m - 1, 1)));
  return year ? `${name} de ${y}` : name;
}

export function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Plain calendar dates ('YYYY-MM-DD') are handled as UTC midnights so no time zone can shift them.
export function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day, n) {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

export function daysBetween(fromDay, toDay) {
  return Math.round((parseDay(toDay) - parseDay(fromDay)) / 86400000);
}

// 0 = Monday … 6 = Sunday (the Rueda's convention).
export function weekdayIndex(day) {
  return (parseDay(day).getUTCDay() + 6) % 7;
}

export function mondayOf(day) {
  return addDays(day, -weekdayIndex(day));
}

export function weekdayName(index) {
  // 2024-01-01 was a Monday.
  return weekdayFmt.format(new Date(Date.UTC(2024, 0, 1 + index)));
}

// 'Lunes 13-10-2026'
export function formatLongDay(day) {
  const [y, m, d] = day.split('-');
  return `${capitalise(weekdayName(weekdayIndex(day)))} ${d}-${m}-${y}`;
}

// For purchase rows: 'Hoy', 'Ayer' or '12 oct'.
export function relativeDay(instant, today = madridDate()) {
  const day = madridDate(instant);
  if (day === today) return 'Hoy';
  if (day === addDays(today, -1)) return 'Ayer';
  return shortDayFmt.format(parseDay(day)).replace('.', '');
}
