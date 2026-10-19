/** Match the original blog's browser-local Intl calendar, without changing source timestamps. */
export function integratedDateLabel(value: unknown, separator = '.'): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  // A date-only value describes a calendar day, not an instant at UTC midnight.
  // Validate it before formatting so invalid days cannot roll into another month.
  const calendarOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (calendarOnly && date.toISOString().slice(0, 10) !== value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(calendarOnly ? { timeZone: 'UTC' } : {}),
  }).format(date).replaceAll('/', separator);
}
