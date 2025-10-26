import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from './config.service';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('path');
jest.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
    mockPath.join.mockReturnValue('/mock/path/.lingo-tracker.json');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return parsed config when file exists and is valid JSON', () => {
      const mockConfig = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        subfolderSplitThreshold: 100,
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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = service.getConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        '/mock/path/.lingo-tracker.json',
        'utf8',
      );
      expect(result).toEqual(mockConfig);
    });

    it('should throw NotFoundException when file does not exist', () => {
      const notFoundError = new Error('ENOENT: no such file or directory');
      (notFoundError as any).code = 'ENOENT';
      mockFs.readFileSync.mockImplementation(() => {
        throw notFoundError;
      });

      expect(() => service.getConfig()).toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when file cannot be read due to permissions', () => {
      const permissionError = new Error('EACCES: permission denied');
      (permissionError as any).code = 'EACCES';
      mockFs.readFileSync.mockImplementation(() => {
        throw permissionError;
      });

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow('Failed to read configuration file');
    });

    it('should throw InternalServerErrorException when file contains invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('invalid json content {');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow('Invalid configuration file format');
    });

    it('should throw InternalServerErrorException when file is empty', () => {
      mockFs.readFileSync.mockReturnValue('');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow('Invalid configuration file format');
    });

    it('should throw InternalServerErrorException when file contains non-JSON content', () => {
      mockFs.readFileSync.mockReturnValue('This is not JSON at all');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow('Invalid configuration file format');
    });

    it('should handle minimal valid config', () => {
      const minimalConfig = {
        exportFolder: 'export',
        importFolder: 'import',
        subfolderSplitThreshold: 50,
        baseLocale: 'en',
        locales: [],
        collections: {
          Default: {
            translationsFolder: 'i18n',
          },
        },
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(minimalConfig));

      const result = service.getConfig();

      expect(result).toEqual(minimalConfig);
    });

    it('should handle config with multiple collections and overrides', () => {
      const configWithOverrides = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        subfolderSplitThreshold: 100,
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
            subfolderSplitThreshold: 50,
          },
        },
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithOverrides));

      const result = service.getConfig();

      expect(result).toEqual(configWithOverrides);
    });

    it('should handle config with empty collections object', () => {
      const configWithEmptyCollections = {
        exportFolder: 'export',
        importFolder: 'import',
        subfolderSplitThreshold: 50,
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithEmptyCollections));

      const result = service.getConfig();

      expect(result).toEqual(configWithEmptyCollections);
    });
  });
});
