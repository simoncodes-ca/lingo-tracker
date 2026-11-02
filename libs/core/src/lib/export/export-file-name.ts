import type { ExportFormat } from './types';

/** Uses a shared run date when supplied, so planning and writing agree across midnight. */
export function exportFileName(
  format: ExportFormat,
  locale: string,
  baseLocale: string | undefined,
  pattern?: string,
  date: Date = new Date(),
): string {
  if (!pattern) return `${locale}.${format}`;
  let name = pattern
    .replace('{locale}', locale)
    .replace('{target}', locale)
    .replace('{date}', date.toISOString().split('T')[0]);
  if (baseLocale) name = name.replace('{source}', baseLocale);
  return name.endsWith(`.${format}`) ? name : `${name}.${format}`;
}
