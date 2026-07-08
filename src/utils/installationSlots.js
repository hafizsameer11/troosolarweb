/**
 * Client-side fallback when GET /api/calendar/slots is unavailable.
 * Mirrors backend CalendarController (72h offset for installation, weekdays, 30 days).
 */
export function generateLocalCalendarSlots({
  paymentDate = new Date().toISOString().slice(0, 10),
  type = 'installation',
  days = 30,
} = {}) {
  const hoursOffset = type === 'audit' ? 48 : 72;
  const start = new Date(`${paymentDate}T12:00:00`);
  start.setHours(start.getHours() + hoursOffset);

  const slots = [];
  for (let day = 0; day < days; day += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const dateStr = d.toISOString().slice(0, 10);
    slots.push({
      date: dateStr,
      time: '09:00',
      datetime: `${dateStr} 09:00:00`,
      available: true,
    });
  }
  return slots;
}

export function uniqueCalendarDates(slots = []) {
  const seen = new Set();
  const unique = [];
  slots.forEach((slot) => {
    const key = String(slot?.date || '').slice(0, 10);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(slot);
  });
  return unique;
}
