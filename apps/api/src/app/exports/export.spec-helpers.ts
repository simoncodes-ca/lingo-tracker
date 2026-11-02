import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addResource, type OpenedProject, openProjectCollection } from '@simoncodes-ca/core';

/** Real resources and opened project, shared by export mapper and job specs. */
export function exportProject(): OpenedProject {
  const projectRoot = mkdtempSync(join(tmpdir(), 'api-export-'));
  const project: OpenedProject = {
    projectRoot,
    sourceConfig: {
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      collections: { app: { translationsFolder: './i18n' } },
    },
  };
  mkdirSync(join(projectRoot, 'i18n'));
  addResource(openProjectCollection(project, 'app', { writable: true }), { key: 'hello', baseValue: 'Hello' });
  return project;
}

export function closeExportProject(project: OpenedProject): void {
  rmSync(project.projectRoot, { recursive: true, force: true });
}
