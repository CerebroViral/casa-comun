import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  madridMonth, madridDate, nextMonth, prevMonth, monthName, formatLongDay, mondayOf, weekdayIndex, addDays,
  daysBetween, relativeDay,
} from '../../js/periods.js';

test('month boundaries follow Madrid, not UTC (winter, UTC+1)', () => {
  assert.equal(madridMonth('2026-10-31T22:59:59Z'), '2026-10'); // 23:59:59 in Madrid (CET after 25 Oct)
  assert.equal(madridMonth('2026-10-31T23:00:00Z'), '2026-11'); // 00:00 on 1 November in Madrid
  assert.equal(madridMonth('2026-12-31T23:30:00Z'), '2027-01');
});

test('month boundaries follow Madrid in summer time (UTC+2)', () => {
  assert.equal(madridMonth('2026-06-30T21:59:59Z'), '2026-06');
  assert.equal(madridMonth('2026-06-30T22:00:00Z'), '2026-07');
  assert.equal(madridDate('2026-03-29T00:30:00Z'), '2026-03-29'); // DST change night
});

test('next and previous month wrap the year', () => {
  assert.equal(nextMonth('2026-10'), '2026-11');
  assert.equal(nextMonth('2026-12'), '2027-01');
  assert.equal(prevMonth('2027-01'), '2026-12');
  assert.equal(prevMonth('2026-03'), '2026-02');
});

test('Spanish month and day names', () => {
  assert.equal(monthName('2026-10'), 'octubre');
  assert.equal(monthName('2026-01', { year: true }), 'enero de 2026');
  assert.equal(formatLongDay('2026-10-13'), 'Martes 13-10-2026');
  assert.equal(formatLongDay('2026-10-12'), 'Lunes 12-10-2026');
});

test('weeks run Monday to Sunday', () => {
  assert.equal(weekdayIndex('2026-10-12'), 0); // Monday
  assert.equal(weekdayIndex('2026-10-18'), 6); // Sunday
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-10-12', '2026-11-09'), 28);
  assert.equal(daysBetween('2026-03-23', '2026-03-30'), 7, 'DST does not shift calendar days');
});

test('relative day labels for purchases', () => {
  assert.equal(relativeDay('2026-10-16T10:00:00Z', '2026-10-16'), 'Hoy');
  assert.equal(relativeDay('2026-10-15T10:00:00Z', '2026-10-16'), 'Ayer');
  assert.equal(relativeDay('2026-10-12T10:00:00Z', '2026-10-16'), '12 oct');
});
