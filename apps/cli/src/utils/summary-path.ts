import * as path from 'path';
import * as os from 'os';

export function buildSummaryPath(type: 'import' | 'export'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(os.tmpdir(), `lingo-tracker-${type}-summary-${timestamp}.md`);
}
