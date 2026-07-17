/** UTC yyyy-mm-dd key for a date (holiday-set membership + comparisons). */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Count working days in the inclusive range [start, end]: Monday–Friday only
 * (weekend = Sat + Sun), excluding any day present in `holidays` (a set of UTC
 * yyyy-mm-dd keys). All arithmetic is in UTC so it never drifts with the server
 * timezone or DST. Guarded at 366 days so a bad range can't spin.
 */
export function countWorkingDays(start: Date, end: Date, holidays: ReadonlySet<string>): number {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let count = 0;
  let guard = 0;
  while (cursor <= last && guard < 366) {
    const dow = cursor.getUTCDay(); // 0 = Sun … 6 = Sat
    if (dow >= 1 && dow <= 5 && !holidays.has(isoDay(cursor))) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return count;
}
