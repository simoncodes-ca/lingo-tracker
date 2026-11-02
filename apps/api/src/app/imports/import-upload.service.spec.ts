import type * as FileSystem from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { type OpenedProject } from '@simoncodes-ca/core';
import { internalErrors } from '@simoncodes-ca/core/testing';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { closeImportProject, importProject } from './import.spec-helpers';
import { ImportSourceService } from './import-source.service';
import { ImportUploadService, type UploadedImportFile } from './import-upload.service';

const fs = jest.requireActual<typeof FileSystem>('node:fs');

function file(originalname = 'fr.json', contents = '{}'): UploadedImportFile {
  const buffer = Buffer.from(contents);
  return { originalname, buffer, size: buffer.length };
}

describe('ImportUploadService (real filesystem)', () => {
  let project: OpenedProject;
  const service = new ImportUploadService(new ImportSourceService());
  const upload = (files = [file()], folder?: string, overwrite?: string) =>
    service.upload(project, { collection: 'app', folder, overwrite }, files);
  const path = (name: string) => join(project.projectRoot, 'dist/import', name);
  const rejection = (action: () => unknown, errors: string[], message = 'Invalid upload') => {
    try {
      action();
      throw new Error('Expected upload rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException)
        expect(error.getResponse()).toEqual({ statusCode: 400, message, error: 'Bad Request', errors });
    }
  };
  beforeEach(() => {
    const opened = importProject();
    project = { ...opened, projectRoot: fs.realpathSync(opened.projectRoot) };
  });
  afterEach(() => {
    jest.restoreAllMocks();
    closeImportProject(project);
  });

  it('accepts all supported extensions, creates nested folders and returns a refreshed listing without mutations or temps', () => {
    const mutation = jest.fn();
    project = { ...project, onMutation: mutation };
    const files = [file('fr.JSON'), file('de.xlf', '<xliff/>'), file('es.xliff', '<xliff/>')];
    const listing = upload(files, 'dist/import/missing/nested');
    expect(listing).toMatchObject({ folder: 'dist/import/missing/nested', exists: true });
    expect(listing.files.map((entry) => entry.name)).toEqual(['de.xlf', 'es.xliff', 'fr.JSON']);
    expect(fs.readdirSync(join(project.projectRoot, 'dist/import/missing/nested')).sort()).toEqual([
      'de.xlf',
      'es.xliff',
      'fr.JSON',
    ]);
    for (const entry of files)
      expect(fs.readFileSync(join(project.projectRoot, 'dist/import/missing/nested', entry.originalname))).toEqual(
        entry.buffer,
      );
    expect(mutation).not.toHaveBeenCalled();
  });

  it('rejects an empty batch before creating the folder', () => {
    rejection(() => upload([]), ['files must contain at least one file.']);
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it.each([
    ['../x.json', 'must not contain path separators or control characters.'],
    ['a/b.json', 'must not contain path separators or control characters.'],
    ['a\\b.json', 'must not contain path separators or control characters.'],
    ['x\u0000.json', 'must not contain path separators or control characters.'],
    ['x\u001f.json', 'must not contain path separators or control characters.'],
    ['x\u007f.json', 'must not contain path separators or control characters.'],
    ['.hidden.json', 'must not be hidden.'],
    ['CON.json', 'is not a portable file name.'],
    ['CON.tar.json', 'is not a portable file name.'],
    ['NUL .json', 'is not a portable file name.'],
    ['COM¹.json', 'is not a portable file name.'],
    ['CONIN$.json', 'is not a portable file name.'],
    ['CONOUT$.json', 'is not a portable file name.'],
    ['COM0.json', 'is not a portable file name.'],
    ['LPT³.json', 'is not a portable file name.'],
    ['lPt9.xlf', 'is not a portable file name.'],
    ['x?.json', 'is not a portable file name.'],
    [' fr.json', 'must not start or end with whitespace or a dot.'],
    ['fr.json ', 'must not start or end with whitespace or a dot.'],
    [`${'é'.repeat(126)}.json`, 'must be at most 255 bytes.'],
    [`${'a'.repeat(251)}.json`, 'must be at most 255 bytes.'],
    ['fr.txt', 'must be an .xliff, .xlf or .json file.'],
  ])('rejects %p with an error and no file written', (name, reason) => {
    const errors = [`"${name}" ${reason}`];
    if (name === '../x.json') errors.push('"../x.json" must not be hidden.');
    if (name === 'fr.json ') errors.push('"fr.json " must be an .xliff, .xlf or .json file.');
    rejection(() => upload([file('valid.json'), file(name)]), errors);
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it('collects every applicable error for dot names and a trailing dot', () => {
    rejection(
      () => upload([file('..')]),
      [
        '".." must not start or end with whitespace or a dot.',
        '".." must not be hidden.',
        '".." must be an .xliff, .xlf or .json file.',
      ],
    );
    rejection(
      () => upload([file('fr.json.')]),
      [
        '"fr.json." must not start or end with whitespace or a dot.',
        '"fr.json." must be an .xliff, .xlf or .json file.',
      ],
    );
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it('rejects an empty file and case-folded or NFC duplicate names before writing anything', () => {
    rejection(() => upload([file('fr.json', '')]), ['"fr.json" is empty.']);
    rejection(() => upload([file('fr.json'), file('FR.json')]), ['"FR.json" is listed twice.']);
    rejection(() => upload([file('é.json'), file('e\u0301.JSON')]), ['"é.JSON" is listed twice.']);
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it('normalizes accepted names to NFC and accepts a 255-byte name', () => {
    const name = `${'a'.repeat(250)}.json`;
    upload([file('e\u0301.json'), file(name)]);
    expect(
      fs
        .readdirSync(path(''))
        .map((entry) => entry.normalize('NFC'))
        .sort(),
    ).toEqual([name, 'é.json']);
  });

  it('rejects relative and absolute outside folders, including a configured outside default', () => {
    const outside = fs.mkdtempSync(join(tmpdir(), 'upload-outside-'));
    try {
      for (const folder of ['../out', outside])
        rejection(() => upload([file()], folder), ['folder is not allowed for uploads.']);
      const collection = project.sourceConfig.collections?.app;
      if (collection === undefined) throw new Error('Missing collection');
      collection.importFolder = outside;
      rejection(() => upload(), ['folder is not allowed for uploads.']);
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.existsSync(path(''))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked folder and missing descendants of a symlinked ancestor escaping the root', () => {
    const outside = fs.mkdtempSync(join(tmpdir(), 'upload-symlink-'));
    try {
      fs.mkdirSync(join(project.projectRoot, 'dist'));
      fs.symlinkSync(outside, path(''));
      for (const folder of ['dist/import', 'dist/import/new/nested'])
        rejection(() => upload([file()], folder), ['folder is not allowed for uploads.']);
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('allows symlinks resolving inside the root and writes to the real directory', () => {
    const real = join(project.projectRoot, 'real');
    fs.mkdirSync(real);
    fs.mkdirSync(join(project.projectRoot, 'dist'));
    fs.symlinkSync(real, path(''));
    expect(upload().files.map((entry) => entry.name)).toEqual(['fr.json']);
    expect(fs.readFileSync(join(real, 'fr.json'), 'utf8')).toBe('{}');
    expect(fs.readdirSync(real)).toEqual(['fr.json']);
  });

  it('rejects a file used as the folder and maps a file ancestor to a folder write error', () => {
    fs.mkdirSync(path(''), { recursive: true });
    fs.writeFileSync(path('fr.json'), '{}');
    rejection(() => upload([file('es.json')], 'dist/import/fr.json'), ['folder must be a directory']);
    rejection(
      () => upload([file('es.json')], 'dist/import/fr.json/nested'),
      ['folder could not be written'],
      'folder could not be written',
    );
    expect(fs.readdirSync(path(''))).toEqual(['fr.json']);
  });

  it('reports clashing upload names with 409 and only overwrites for the exact true string, keeping on-disk spelling', () => {
    upload([file('FR.json', 'old'), file('é.json', 'old')]);
    const files = [file('fr.json', 'new'), file('e\u0301.JSON', 'new'), file('es.json')];
    for (const overwrite of [undefined, 'false', 'TRUE']) {
      try {
        upload(files, undefined, overwrite);
        throw new Error('Expected conflict');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        if (error instanceof ConflictException)
          expect(error.getResponse()).toEqual({
            statusCode: 409,
            message: 'Files already exist',
            error: 'Conflict',
            errors: ['fr.json', 'é.JSON'],
          });
      }
      expect(fs.readFileSync(path('FR.json'), 'utf8')).toBe('old');
      expect(fs.existsSync(path('es.json'))).toBe(false);
    }
    const listing = upload(files, undefined, 'true');
    expect(listing.files.map((entry) => entry.name.normalize('NFC')).sort()).toEqual(['FR.json', 'es.json', 'é.json']);
    expect(fs.readFileSync(path('FR.json'), 'utf8')).toBe('new');
    expect(
      fs
        .readdirSync(path(''))
        .map((entry) => entry.normalize('NFC'))
        .sort(),
    ).toEqual(['FR.json', 'es.json', 'é.json']);
  });

  it('keeps the first renamed file and removes the temp when the second rename fails', () => {
    const rename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith('es.json')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      rename(from, to);
    });
    rejection(
      () => upload([file('fr.json'), file('es.json')]),
      ['"es.json" could not be written (EACCES).'],
      'folder could not be written',
    );
    expect(fs.readdirSync(path(''))).toEqual(['fr.json']);
    expect(fs.readFileSync(path('fr.json'), 'utf8')).toBe('{}');
  });

  it.each(['EACCES', 'EPERM', 'ENOSPC', 'EROFS'])('maps write error %s and removes its temp', (code) => {
    jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('failed'), { code });
    });
    rejection(() => upload(), [`"fr.json" could not be written (${code}).`], 'folder could not be written');
    expect(fs.readdirSync(path(''))).toEqual([]);
  });

  it.each(['EACCES', 'EPERM', 'ENOTDIR'])('maps mkdir error %s before writing', (code) => {
    jest.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('failed'), { code });
    });
    rejection(() => upload(), ['folder could not be written'], 'folder could not be written');
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it('propagates unexpected filesystem errors after temp cleanup', () => {
    const error = Object.assign(new Error('unexpected'), { code: 'EIO' });
    jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw error;
    });
    expect(() => upload()).toThrow(error);
    expect(fs.readdirSync(path(''))).toEqual([]);
  });

  it('opens writable collections first: read-only is 403 and unknown is 404 even for an empty batch', () => {
    const collection = project.sourceConfig.collections?.app;
    if (collection === undefined) throw new Error('Missing collection');
    collection.readOnly = true;
    for (const [name, status] of [
      ['app', 403],
      ['unknown', 404],
    ] as const) {
      try {
        service.upload(project, { collection: name }, []);
        throw new Error('Expected rejection');
      } catch (error) {
        if (name === 'app') expect(error).toBeInstanceOf(internalErrors.ReadOnlyCollectionError);
        expect(toHttpException(error).getStatus()).toBe(status);
      }
    }
    expect(fs.existsSync(path(''))).toBe(false);
  });
  it('rejects the root, hidden path segments and node_modules even with overwrite enabled', () => {
    fs.writeFileSync(join(project.projectRoot, 'package.json'), 'original');
    for (const folder of ['.', '.vscode', 'dist/.hidden/nested', 'node_modules', 'dist/node_modules/nested']) {
      rejection(() => upload([file('package.json')], folder, 'true'), ['folder is not allowed for uploads.']);
    }
    expect(fs.readFileSync(join(project.projectRoot, 'package.json'), 'utf8')).toBe('original');
    expect(fs.existsSync(join(project.projectRoot, '.vscode'))).toBe(false);
  });

  it('rejects every configured translations folder and descendants, including missing folders and aliases', () => {
    const stored = join(project.projectRoot, 'i18n/resource_entries.json');
    const before = fs.readFileSync(stored);
    project.sourceConfig.collections = {
      ...project.sourceConfig.collections,
      other: { translationsFolder: 'resources/other' },
    };
    fs.symlinkSync(join(project.projectRoot, 'i18n'), join(project.projectRoot, 'alias'));
    for (const folder of [
      'i18n',
      'i18n/nested',
      'resources/other',
      'resources/other/nested',
      'alias',
      'alias/nested',
    ]) {
      rejection(() => upload([file('resource_entries.json')], folder, 'true'), ['folder is not allowed for uploads.']);
    }
    expect(fs.existsSync(join(project.projectRoot, 'resources'))).toBe(false);
    expect(fs.existsSync(join(project.projectRoot, 'i18n/nested'))).toBe(false);
    expect(fs.readFileSync(stored)).toEqual(before);
  });

  it('checks restrictions on the resolved folder for symlinks into hidden folders and node_modules', () => {
    for (const [target, alias] of [
      ['.vscode', 'editor-alias'],
      ['node_modules', 'modules-alias'],
    ]) {
      fs.mkdirSync(join(project.projectRoot, target));
      fs.symlinkSync(join(project.projectRoot, target), join(project.projectRoot, alias));
      rejection(() => upload([file()], alias), ['folder is not allowed for uploads.']);
      expect(fs.readdirSync(join(project.projectRoot, target))).toEqual([]);
    }
  });

  it('resolves configured translations folder symlinks before checking containment', () => {
    const collection = project.sourceConfig.collections?.app;
    if (collection === undefined) throw new Error('Missing collection');
    fs.mkdirSync(join(project.projectRoot, 'resources'));
    fs.symlinkSync(join(project.projectRoot, 'resources'), join(project.projectRoot, 'translations-alias'));
    collection.translationsFolder = 'translations-alias';
    rejection(() => upload([file()], 'resources/nested'), ['folder is not allowed for uploads.']);
    expect(fs.readdirSync(join(project.projectRoot, 'resources'))).toEqual([]);
  });

  it('rejects directory clashes before 409 or overwrite and writes no other batch file', () => {
    fs.mkdirSync(path('FR.json'), { recursive: true });
    for (const overwrite of [undefined, 'true']) {
      rejection(
        () => upload([file('es.json'), file('fr.json')], undefined, overwrite),
        ['"fr.json" clashes with a folder.'],
      );
      expect(fs.readdirSync(path(''))).toEqual(['FR.json']);
      expect(fs.statSync(path('FR.json')).isDirectory()).toBe(true);
    }
  });

  it('maps a dangling target-folder symlink to a folder write error', () => {
    fs.mkdirSync(join(project.projectRoot, 'dist'));
    fs.symlinkSync(join(project.projectRoot, 'missing'), path(''));
    rejection(() => upload(), ['folder could not be written'], 'folder could not be written');
    expect(fs.existsSync(join(project.projectRoot, 'missing'))).toBe(false);
  });

  it('uploads through a symlinked project root without resolving it in the request', () => {
    const original = project;
    const parent = fs.mkdtempSync(join(tmpdir(), 'upload-root-'));
    const alias = join(parent, 'project');
    fs.symlinkSync(original.projectRoot, alias);
    try {
      project = { ...original, projectRoot: alias };
      expect(upload().files.map((entry) => entry.name)).toEqual(['fr.json']);
      expect(fs.readFileSync(join(original.projectRoot, 'dist/import/fr.json'), 'utf8')).toBe('{}');
    } finally {
      project = original;
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
  it('treats missing files from non-multipart requests as an empty batch', () => {
    rejection(
      () => service.upload(project, { collection: 'app' }, undefined),
      ['files must contain at least one file.'],
    );
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it('allows only the effective import folder and its descendants, rejecting siblings and ancestors', () => {
    expect(upload().files.map((entry) => entry.name)).toEqual(['fr.json']);
    expect(upload([file('es.json')], 'dist/import/nested').folder).toBe('dist/import/nested');
    for (const folder of ['dist', '.', 'dist/other', 'dist/import-sibling']) {
      rejection(() => upload([file('de.json')], folder), ['folder is not allowed for uploads.']);
    }
    expect(fs.existsSync(join(project.projectRoot, 'dist/other'))).toBe(false);
    expect(fs.existsSync(join(project.projectRoot, 'dist/import-sibling'))).toBe(false);
  });

  it('refuses every upload when the effective import folder is outside the root or denied', () => {
    const collection = project.sourceConfig.collections?.app;
    if (collection === undefined) throw new Error('Missing collection');
    for (const folder of ['../outside', '.', '.vscode', 'node_modules', 'i18n', 'i18n/nested']) {
      collection.importFolder = folder;
      for (const requested of [undefined, 'dist/import']) {
        rejection(() => upload([file()], requested), ['folder is not allowed for uploads.']);
      }
    }
    expect(fs.existsSync(path(''))).toBe(false);
  });

  it.each(['darwin', 'win32', 'linux'] as const)(
    'rejects case-variant protected uploads on %s and leaves resources byte-for-byte unchanged',
    (platform) => {
      const stored = join(project.projectRoot, 'i18n/resource_entries.json');
      const before = fs.readFileSync(stored);
      const uploader = new ImportUploadService(new ImportSourceService(), platform);
      for (const folder of ['I18N', 'I18n/nested', 'NODE_MODULES/x']) {
        rejection(
          () =>
            uploader.upload(project, { collection: 'app', folder, overwrite: 'true' }, [file('resource_entries.json')]),
          ['folder is not allowed for uploads.'],
        );
        expect(fs.readFileSync(stored)).toEqual(before);
        if (platform !== 'linux') {
          const collection = project.sourceConfig.collections?.app;
          if (collection === undefined) throw new Error('Missing collection');
          collection.importFolder = folder;
          rejection(
            () => uploader.upload(project, { collection: 'app', overwrite: 'true' }, [file('resource_entries.json')]),
            ['folder is not allowed for uploads.'],
          );
          expect(fs.readFileSync(stored)).toEqual(before);
          collection.importFolder = 'dist/import';
        }
      }
    },
  );

  it.each(['darwin', 'win32', 'linux'] as const)(
    'compares pending allowlist tails according to the injected %s platform',
    (platform) => {
      const collection = project.sourceConfig.collections?.app;
      if (collection === undefined) throw new Error('Missing collection');
      collection.importFolder = 'dist/Import';
      const uploader = new ImportUploadService(new ImportSourceService(), platform);
      const action = () => uploader.upload(project, { collection: 'app', folder: 'dist/import/nested' }, [file()]);
      if (platform === 'linux') rejection(action, ['folder is not allowed for uploads.']);
      else expect(action().files.map((entry) => entry.name)).toEqual(['fr.json']);
    },
  );

  it.each(['darwin', 'win32', 'linux'] as const)(
    'compares pending translations-folder tails according to the injected %s platform',
    (platform) => {
      project.sourceConfig.collections = {
        ...project.sourceConfig.collections,
        other: { translationsFolder: 'dist/import/Reserved' },
      };
      const uploader = new ImportUploadService(new ImportSourceService(), platform);
      // Stop before mkdir so the tail stays nonexistent on case-insensitive test filesystems too.
      const reachedMkdir = new Error('Reached mkdir after pending-tail validation');
      jest.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
        throw reachedMkdir;
      });
      const action = () =>
        uploader.upload(project, { collection: 'app', folder: 'dist/import/RESERVED/nested' }, [file()]);
      if (platform === 'linux') expect(action).toThrow(reachedMkdir);
      else rejection(action, ['folder is not allowed for uploads.']);
    },
  );

  it.each(['darwin', 'win32', 'linux'] as const)(
    'applies the node_modules deny rule inside the allowlist according to %s',
    (platform) => {
      const uploader = new ImportUploadService(new ImportSourceService(), platform);
      const action = () =>
        uploader.upload(project, { collection: 'app', folder: 'dist/import/Node_Modules/pkg' }, [file()]);
      if (platform === 'linux') expect(action().files.map((entry) => entry.name)).toEqual(['fr.json']);
      else rejection(action, ['folder is not allowed for uploads.']);
    },
  );
});
