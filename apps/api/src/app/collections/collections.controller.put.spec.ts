import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { CONFIG_FILENAME, type LingoTrackerConfig } from '@simoncodes-ca/core';
import type { CreateCollectionDto, UpdateCollectionDto } from '@simoncodes-ca/data-transfer';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
import { RouteProjectPipe } from '../config/route-project';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { createCollectionBody, updateCollectionBody } from '../validation/dto-schemas';
import { SchemaPipe } from '../validation/valid-body';
import { CollectionsController } from './collections.controller';
import { RouteCollectionPipe, routeCollectionRef } from './route-collection';

/**
 * PUT /collections/:name through the real mapper and real core, against a temp project: the
 * fields a client does not send must survive the update.
 */
describe('CollectionsController PUT (real core)', () => {
  let projectDir: string;
  let controller: CollectionsController;
  let routeCollectionPipe: RouteCollectionPipe;
  let routeProjectPipe: RouteProjectPipe;

  const stored = {
    translationsFolder: './i18n',
    exportFolder: 'custom/export',
    importFolder: 'custom/import',
    locales: ['en', 'fr'],
    translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' },
    tags: ['team-x'],
  };
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { app: stored },
  };
  const readConfig = (): LingoTrackerConfig => JSON.parse(readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8'));

  const updateCollection = async (name: string, body: UpdateCollectionDto): Promise<{ message: string }> => {
    const current = routeCollectionPipe.transform(
      routeCollectionRef({ lifecycle: 'update' }, { method: 'PUT', params: { collectionName: name } }),
    );
    new SchemaPipe(updateCollectionBody, 'request body').transform(body);
    return controller.updateCollectionByName(body, current);
  };

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-api-collections-put-'));
    jest.spyOn(process, 'cwd').mockReturnValue(projectDir);
    writeFileSync(join(projectDir, CONFIG_FILENAME), JSON.stringify(config));

    const module = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        ConfigService,
        RouteCollectionPipe,
        RouteProjectPipe,
        { provide: CollectionIndex, useValue: { sink: jest.fn() } },
      ],
    }).compile();
    controller = module.get(CollectionsController);
    routeCollectionPipe = module.get(RouteCollectionPipe);
    routeProjectPipe = module.get(RouteProjectPipe);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('answers the exact 400 body for blank and whitespace renames without changing config', async () => {
    const before = readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8');
    for (const name of ['', ' ']) {
      const error = await updateCollection('app', {
        name,
        collection: { translationsFolder: './changed', locales: ['en', 'de'] },
      }).catch((cause: unknown) => cause);
      const http = toHttpException(error);
      expect(http.getStatus()).toBe(400);
      expect(http.getResponse()).toEqual({
        statusCode: 400,
        message: 'name must be a non-empty string',
        error: 'Bad Request',
      });
      let existingCollectionBody: unknown;
      try {
        new SchemaPipe(createCollectionBody, 'request body').transform({
          name,
          collection: { translationsFolder: './i18n' },
        });
      } catch (cause: unknown) {
        existingCollectionBody = toHttpException(cause).getResponse();
      }
      expect(existingCollectionBody).toBeDefined();
      expect(JSON.stringify(http.getResponse())).toBe(JSON.stringify(existingCollectionBody));
      expect(readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8')).toBe(before);
    }
  });

  it('answers 404 for a missing collection before validating a blank rename', async () => {
    const before = readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8');
    const error = await updateCollection('missing', {
      name: '',
      collection: { translationsFolder: './i18n' },
    }).catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(404);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8')).toBe(before);
  });

  it('keeps translation, exportFolder and importFolder through the Tracker form payload', async () => {
    // The shape CollectionFormDialog#buildResult sends: it never carries these three fields.
    const body: UpdateCollectionDto = {
      name: 'app',
      collection: {
        translationsFolder: './i18n',
        locales: ['en', 'fr'],
        readOnly: false,
        tags: ['team-x', 'Team Y'],
      },
    };

    const result = await updateCollection('app', body);

    expect(result).toEqual({ message: 'Collection "app" updated successfully' });
    expect(readConfig().collections['app']).toEqual({ ...stored, tags: ['team-x', 'team-y'] });
  });

  it('applies the fields a client does send, including clears', async () => {
    await updateCollection('app', {
      collection: { translationsFolder: './i18n', tags: [], exportFolder: 'dist/lingo-export' },
    });

    const { tags, exportFolder, ...rest } = stored;
    expect(readConfig().collections['app']).toEqual(rest);
  });

  it('answers 400 for invalid protected terms on create without changing config', async () => {
    const before = readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8');
    const error = await controller
      .createCollection(
        {
          name: 'new',
          collection: { translationsFolder: './new', protectedTerms: ['valid', 42] },
        } as unknown as CreateCollectionDto,
        routeProjectPipe.transform(true),
      )
      .catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(400);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8')).toBe(before);
  });

  it('answers 400 for malformed terms even when the create name is taken', async () => {
    const before = readFileSync(join(projectDir, CONFIG_FILENAME));
    const error = await controller
      .createCollection(
        {
          name: 'app',
          collection: { translationsFolder: './other', protectedTerms: ['valid', 42] },
        } as unknown as CreateCollectionDto,
        routeProjectPipe.transform(true),
      )
      .catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(400);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME))).toEqual(before);
  });

  it('answers 400 for invalid protected terms on update without changing config', async () => {
    const before = readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8');
    const error = await updateCollection('app', {
      collection: { translationsFolder: './changed', protectedTerms: ['valid', 42] },
    } as unknown as UpdateCollectionDto).catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(400);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME), 'utf8')).toBe(before);
  });

  it('writes valid protected terms when creating a collection', async () => {
    await controller.createCollection(
      {
        name: 'new',
        collection: {
          translationsFolder: './new',
          protectedTermsFile: 'new-terms.json',
          protectedTerms: [' iPhone ', 'Pixel'],
        },
      },
      routeProjectPipe.transform(true),
    );

    expect(readConfig().collections['new'].protectedTermsFile).toBe('new-terms.json');
    expect(JSON.parse(readFileSync(join(projectDir, 'new-terms.json'), 'utf8'))).toEqual(['iPhone', 'Pixel']);
  });

  it('writes valid protected terms when updating a collection', async () => {
    await updateCollection('app', {
      collection: {
        translationsFolder: './i18n',
        protectedTermsFile: 'app-terms.json',
        protectedTerms: ['Pixel', ' Pixel '],
      },
    });

    expect(readConfig().collections['app'].protectedTermsFile).toBe('app-terms.json');
    expect(JSON.parse(readFileSync(join(projectDir, 'app-terms.json'), 'utf8'))).toEqual(['Pixel']);
  });

  it('refuses create with terms and no pointer without changing either file', async () => {
    const termsPath = join(projectDir, 'app-terms.json');
    writeFileSync(termsPath, '["old"]');
    const before = readFileSync(join(projectDir, CONFIG_FILENAME));
    const termsBefore = readFileSync(termsPath);
    const error = await controller
      .createCollection(
        {
          name: 'new',
          collection: { translationsFolder: './new', protectedTerms: ['iPhone'] },
        },
        routeProjectPipe.transform(true),
      )
      .catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(400);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME))).toEqual(before);
    expect(readFileSync(termsPath)).toEqual(termsBefore);
    expect(existsSync(join(projectDir, 'new-terms.json'))).toBe(false);
  });

  it('refuses update with terms and no pointer without changing either file', async () => {
    const termsPath = join(projectDir, 'app-terms.json');
    writeFileSync(termsPath, '["old"]');
    const before = readFileSync(join(projectDir, CONFIG_FILENAME));
    const termsBefore = readFileSync(termsPath);
    const error = await updateCollection('app', {
      collection: { translationsFolder: './changed', protectedTerms: ['iPhone'] },
    }).catch((cause: unknown) => cause);
    expect(toHttpException(error).getStatus()).toBe(400);
    expect(readFileSync(join(projectDir, CONFIG_FILENAME))).toEqual(before);
    expect(readFileSync(termsPath)).toEqual(termsBefore);
  });

  it('uses the stored pointer and writes terms under the renamed entry', async () => {
    const withPointer: LingoTrackerConfig = {
      ...config,
      collections: { app: { ...stored, protectedTermsFile: 'renamed-terms.json' } },
    };
    writeFileSync(join(projectDir, CONFIG_FILENAME), JSON.stringify(withPointer));
    await updateCollection('app', {
      name: 'renamed',
      collection: { translationsFolder: './i18n', protectedTerms: ['iPhone'] },
    });
    expect(readConfig().collections['renamed'].protectedTermsFile).toBe('renamed-terms.json');
    expect(JSON.parse(readFileSync(join(projectDir, 'renamed-terms.json'), 'utf8'))).toEqual(['iPhone']);
  });

  it('uses a pointer supplied with a rename for its terms write', async () => {
    await updateCollection('app', {
      name: 'renamed',
      collection: {
        translationsFolder: './i18n',
        protectedTermsFile: 'new-name-terms.json',
        protectedTerms: ['Pixel'],
      },
    });
    expect(readConfig().collections['app']).toBeUndefined();
    expect(readConfig().collections['renamed'].protectedTermsFile).toBe('new-name-terms.json');
    expect(JSON.parse(readFileSync(join(projectDir, 'new-name-terms.json'), 'utf8'))).toEqual(['Pixel']);
  });
});
