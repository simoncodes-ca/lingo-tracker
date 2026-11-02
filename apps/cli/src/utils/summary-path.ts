import * as os from 'os';
import * as path from 'path';

/** Millisecond-stamped summary path; `writeRunSummary` adds a `-<n>` suffix when it is taken. */
export function buildSummaryPath(type: 'import' | 'export', directory = os.tmpdir()): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  return path.join(directory, `lingo-tracker-${type}-summary-${timestamp}.md`);
}
