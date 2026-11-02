import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OpenedProject } from '@simoncodes-ca/core';

export {
  closeExportProject as closeImportProject,
  exportProject as importProject,
} from '../exports/export.spec-helpers';

export function writeImport(project: OpenedProject, name = 'fr.json', contents = '{"hello":"Bonjour"}'): string {
  writeFileSync(join(project.projectRoot, name), contents);
  return name;
}
export const flushImportJobs = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};
