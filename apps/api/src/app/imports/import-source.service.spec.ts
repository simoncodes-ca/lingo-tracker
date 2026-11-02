import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { OpenedProject } from '@simoncodes-ca/core';
import { closeImportProject, importProject } from './import.spec-helpers';
import { ImportSourceService } from './import-source.service';

describe('ImportSourceService (real core)', () => {
  let project: OpenedProject;
  const service = new ImportSourceService();
  beforeEach(() => {
    project = importProject();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    closeImportProject(project);
  });
  const list = (folder?: string) => service.listSources(project, { collection: 'app', folder });
  const write = (name: string, value = '{}') => {
    const folder = join(project.projectRoot, 'dist/import');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, name), value);
  };

  it('uses inherited settings and returns exists false for missing folders', () => {
    expect(list()).toEqual({
      collection: 'app',
      folder: 'dist/import',
      defaultFolder: 'dist/import',
      exists: false,
      files: [],
    });
    const entry = project.sourceConfig.collections?.app;
    if (entry) entry.importFolder = 'vendor';
    expect(list().folder).toBe('vendor');
    expect(list('missing').folder).toBe('missing');
    const { importFolder: _importFolder, ...config } = project.sourceConfig;
    expect(
      service.listSources(
        {
          ...project,
          sourceConfig: { ...config, importFolder: undefined } as unknown as OpenedProject['sourceConfig'],
        },
        { collection: 'app', folder: undefined },
      ).folder,
    ).toBe('vendor');
    if (entry) delete entry.importFolder;
    expect(
      service.listSources(
        {
          ...project,
          sourceConfig: { ...config, importFolder: undefined } as unknown as OpenedProject['sourceConfig'],
        },
        { collection: 'app' },
      ).folder,
    ).toBe('dist/lingo-import');
  });

  it('rejects a file used as a folder with the specified 400 message', () => {
    write('fr.json');
    expect(() => list('dist/import/fr.json')).toThrow(new BadRequestException('folder must be a directory'));
  });

  it('lists only non-hidden supported regular files, non-recursively and case-insensitively sorted', () => {
    for (const name of ['Z.json', 'a.XLF', 'B.xliff', '.hidden.json', 'notes.txt']) write(name);
    mkdirSync(join(project.projectRoot, 'dist/import/nested'));
    writeFileSync(join(project.projectRoot, 'dist/import/nested/fr.json'), '{}');
    symlinkSync('missing.json', join(project.projectRoot, 'dist/import/broken.json'));
    const listing = list();
    expect(listing.files.map((file) => file.name)).toEqual(['a.XLF', 'B.xliff', 'Z.json']);
    expect(listing.files[0]).toMatchObject({
      path: 'dist/import/a.XLF',
      format: 'xliff',
      modifiedAt: expect.any(String),
      sizeBytes: 2,
    });
  });

  it('infers XLIFF and filename locales, including base and unconfigured targets', () => {
    write('es.xlf', '<xliff><file target-language="FR"/></xliff>');
    write('en.json');
    write('en.xlf', '<xliff><file target-language="xx"/></xliff>');
    write('base.xlf', '<xliff><file target-language="EN"/></xliff>');
    write('fr.xlf', '<xliff><file target-language="xx"/></xliff>');
    write('unknown.xlf', '<xliff><file target-language="xx"/></xliff>');
    const files = list().files;
    expect(files.find((file) => file.name === 'es.xlf')).toMatchObject({
      locale: 'fr',
      localeSource: 'xliff-target-language',
      xliffTargetLanguage: 'FR',
    });
    expect(files.find((file) => file.name === 'en.json')).toMatchObject({
      locale: 'en',
      localeSource: 'file-name',
      localeProblem: 'base-locale',
    });
    expect(files.find((file) => file.name === 'fr.xlf')).toMatchObject({
      locale: 'fr',
      localeSource: 'file-name',
      localeProblem: 'not-configured',
      xliffTargetLanguage: 'xx',
    });
    expect(files.find((file) => file.name === 'unknown.xlf')).toMatchObject({ localeProblem: 'not-configured' });
    expect(files.find((file) => file.name === 'unknown.xlf')).not.toHaveProperty('locale');
    expect(files.find((file) => file.name === 'en.xlf')).toMatchObject({
      locale: 'en',
      localeProblem: 'not-configured',
      xliffTargetLanguage: 'xx',
    });
    expect(files.find((file) => file.name === 'base.xlf')).toMatchObject({
      locale: 'en',
      localeProblem: 'base-locale',
      xliffTargetLanguage: 'EN',
    });
    expect(files.find((file) => file.name === 'en.json')).not.toHaveProperty('xliffTargetLanguage');
  });

  it('accepts absolute external folders and returns external paths as absolute', () => {
    const folder = mkdtempSync(join(tmpdir(), 'import-outside-'));
    try {
      writeFileSync(join(folder, 'fr.json'), '{}');
      expect(list(folder)).toMatchObject({ folder, exists: true, files: [{ path: join(folder, 'fr.json') }] });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    write('fr.json');
    expect(list(join(project.projectRoot, 'dist/import')).folder).toBe('dist/import');
  });

  it('opens locked collections for reading and preserves the core unknown-collection error', () => {
    const entry = project.sourceConfig.collections?.app;
    if (entry) entry.readOnly = true;
    write('fr.json');
    expect(list().files).toHaveLength(1);
    expect(() => service.listSources(project, { collection: 'missing' })).toThrow('not found');
  });
  it('returns exists false when a folder path component is a file', () => {
    write('fr.json');
    expect(list('dist/import/fr.json/nested')).toEqual({
      collection: 'app',
      folder: 'dist/import/fr.json/nested',
      defaultFolder: 'dist/import',
      exists: false,
      files: [],
    });
  });

  it('returns the effective default folder separately from an overridden folder', () => {
    const entry = project.sourceConfig.collections?.app;
    if (entry) entry.importFolder = 'vendor';
    expect(list('other')).toMatchObject({ folder: 'other', defaultFolder: 'vendor' });
    const outside = mkdtempSync(join(tmpdir(), 'import-default-'));
    try {
      if (entry) entry.importFolder = outside;
      expect(list('other')).toMatchObject({ folder: 'other', defaultFolder: outside });
      expect(list()).toMatchObject({ folder: outside, defaultFolder: outside });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('maps folder stat and listing permission errors to a clear 400', () => {
    const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
    write('fr.json');
    for (const code of ['EACCES', 'EPERM']) {
      for (const method of ['statSync', 'readdirSync'] as const) {
        const denied = jest.spyOn(fs, method).mockImplementationOnce(() => {
          throw Object.assign(new Error('Permission denied'), { code });
        });
        expect(() => list()).toThrow(new BadRequestException('folder could not be read'));
        denied.mockRestore();
      }
    }
  });
  it('infers and flags the base locale from filenames and XLIFF when configured locales omit it', () => {
    const collection = project.sourceConfig.collections?.app;
    if (!collection) throw new Error('Missing collection');
    collection.baseLocale = 'en';
    collection.locales = ['fr', 'de'];
    write('en.json');
    write('base.xlf', '<xliff><file target-language="EN"/></xliff>');
    const files = list().files;
    expect(files.find((file) => file.name === 'en.json')).toMatchObject({
      locale: 'en',
      localeSource: 'file-name',
      localeProblem: 'base-locale',
    });
    expect(files.find((file) => file.name === 'base.xlf')).toMatchObject({
      locale: 'en',
      localeSource: 'xliff-target-language',
      xliffTargetLanguage: 'EN',
      localeProblem: 'base-locale',
    });
  });

  it('treats empty XLIFF target-language attributes as absent while preserving filename inference', () => {
    write('fr.xlf', '<xliff><file target-language=""/></xliff>');
    write('unknown.xlf', '<xliff><file target-language=""/></xliff>');
    write('en.xlf', '<xliff><file target-language=""/></xliff>');
    const files = list().files;
    for (const file of files) expect(file).not.toHaveProperty('xliffTargetLanguage');
    expect(files.find((file) => file.name === 'fr.xlf')).toMatchObject({ locale: 'fr', localeSource: 'file-name' });
    expect(files.find((file) => file.name === 'fr.xlf')).not.toHaveProperty('localeProblem');
    expect(files.find((file) => file.name === 'unknown.xlf')).not.toHaveProperty('locale');
    expect(files.find((file) => file.name === 'unknown.xlf')).not.toHaveProperty('localeProblem');
    expect(files.find((file) => file.name === 'en.xlf')).toMatchObject({ locale: 'en', localeProblem: 'base-locale' });
  });
});
