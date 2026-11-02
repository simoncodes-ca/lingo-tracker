const MS_PER_DAY = 86_400_000;
/** Beyond this many days a relative phrase stops being useful and the date is shown. */
const RELATIVE_DAYS = 6;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * A file's modified time for the file row: "today 16:45", "yesterday 09:10", "3 days ago",
 * else a short date. The words come from Intl in `language`, so no copy is hardcoded.
 */
export function formatModified(modifiedAt: string | Date, now: Date, language: string): string {
  const modified = new Date(modifiedAt);
  const days = Math.round((startOfDay(now) - startOfDay(modified)) / MS_PER_DAY);
  if (days < 0 || days > RELATIVE_DAYS) {
    return new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      ...(days < 0 ? { timeStyle: 'short' as const } : {}),
    }).format(modified);
  }
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-days, 'day');
  if (days > 1) return relative;
  return `${relative} ${new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(modified)}`;
}
