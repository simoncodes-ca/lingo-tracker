import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { InvalidConfigError } from '@simoncodes-ca/core';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let projectDir: string;

  function catchConfigError(): unknown {
    try {
      service.getConfig();
    } catch (error) {
      return error;
    }
    throw new Error('Expected a config error');
  }

  function writeConfig(content: string): void {
    writeFileSync(join(projectDir, '.lingo-tracker.json'), content, 'utf8');
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);

    projectDir = mkdtempSync(join(tmpdir(), 'lingo-api-config-'));
    jest.spyOn(process, 'cwd').mockReturnValue(projectDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return parsed config when file exists and is valid JSON', () => {
      const mockConfig = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'fr', 'es'],
        collections: {
          Main: {
            translationsFolder: 'src/i18n',
          },
          Admin: {
            translationsFolder: 'src/admin/i18n',
            baseLocale: 'en-US',
          },
        },
      };

      writeConfig(JSON.stringify(mockConfig));

      const result = service.getConfig();

      expect(result).toEqual(mockConfig);
    });

    it('should throw NotFoundException when file does not exist', () => {
      expect(() => service.getConfig()).toThrow(NotFoundException);
      expect(toHttpException(catchConfigError()).getResponse()).toMatchObject({
        statusCode: 404,
        message: 'Configuration file not found',
      });
    });

    it('should throw InternalServerErrorException when the file cannot be read', () => {
      // A directory in place of the file: it exists, but reading it fails (EISDIR).
      mkdirSync(join(projectDir, '.lingo-tracker.json'));

      expect(() => service.getConfig()).toThrow(InvalidConfigError);
      expect(toHttpException(catchConfigError()).getResponse()).toMatchObject({
        statusCode: 500,
        message: 'Failed to read configuration file',
      });
    });

    it('should throw InternalServerErrorException when file contains invalid JSON', () => {
      writeConfig('invalid json content {');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(toHttpException(catchConfigError()).getResponse()).toMatchObject({
        statusCode: 500,
        message: 'Invalid configuration file format',
      });
    });

    it('should throw InternalServerErrorException when file is empty', () => {
      writeConfig('');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(toHttpException(catchConfigError()).getResponse()).toMatchObject({
        statusCode: 500,
        message: 'Invalid configuration file format',
      });
    });

    it('should throw InternalServerErrorException when file contains non-JSON content', () => {
      writeConfig('This is not JSON at all');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(toHttpException(catchConfigError()).getResponse()).toMatchObject({
        statusCode: 500,
        message: 'Invalid configuration file format',
      });
    });

    it('should handle minimal valid config', () => {
      const minimalConfig = {
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: [],
        collections: {
          Default: {
            translationsFolder: 'i18n',
          },
        },
      };

      writeConfig(JSON.stringify(minimalConfig));

      const result = service.getConfig();

      expect(result).toEqual(minimalConfig);
    });

    it('should handle config with multiple collections and overrides', () => {
      const configWithOverrides = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: {
          Main: {
            translationsFolder: 'src/i18n',
          },
          Admin: {
            translationsFolder: 'src/admin/i18n',
            baseLocale: 'en-US',
            locales: ['en-US', 'fr-CA'],
          },
          Mobile: {
            translationsFolder: 'src/mobile/i18n',
            exportFolder: 'dist/mobile-export',
          },
        },
      };

      writeConfig(JSON.stringify(configWithOverrides));

      const result = service.getConfig();

      expect(result).toEqual(configWithOverrides);
    });

    it('should handle config with empty collections object', () => {
      const configWithEmptyCollections = {
        exportFolder: 'export',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
      };

      writeConfig(JSON.stringify(configWithEmptyCollections));

      const result = service.getConfig();

      expect(result).toEqual(configWithEmptyCollections);
    });
  });
});
