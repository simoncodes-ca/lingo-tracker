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
jest.mock('@lingo-tracker/common', () => ({
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
        translationsFolder: 'src/i18n',
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        subfolderSplitThreshold: 100,
        baseLocale: 'en',
        locales: ['en', 'fr', 'es'],
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = service.getConfig();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPath.join).toHaveBeenCalledWith(
        process.cwd(),
        '.lingo-tracker.json',
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        '/mock/path/.lingo-tracker.json',
        'utf8',
      );
      expect(result).toEqual(mockConfig);
    });

    it('should throw NotFoundException when file does not exist', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => service.getConfig()).toThrow(NotFoundException);
      expect(() => service.getConfig()).toThrow('Configuration file not found');
    });

    it('should throw NotFoundException when file cannot be read due to permissions', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => service.getConfig()).toThrow(NotFoundException);
      expect(() => service.getConfig()).toThrow('Configuration file not found');
    });

    it('should throw InternalServerErrorException when file contains invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('invalid json content {');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow(
        'Invalid configuration file format',
      );
    });

    it('should throw InternalServerErrorException when file is empty', () => {
      mockFs.readFileSync.mockReturnValue('');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow(
        'Invalid configuration file format',
      );
    });

    it('should throw InternalServerErrorException when file contains non-JSON content', () => {
      mockFs.readFileSync.mockReturnValue('This is not JSON at all');

      expect(() => service.getConfig()).toThrow(InternalServerErrorException);
      expect(() => service.getConfig()).toThrow(
        'Invalid configuration file format',
      );
    });

    it('should handle minimal valid config', () => {
      const minimalConfig = {
        translationsFolder: 'i18n',
        exportFolder: 'export',
        importFolder: 'import',
        subfolderSplitThreshold: 50,
        baseLocale: 'en',
        locales: [],
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(minimalConfig));

      const result = service.getConfig();

      expect(result).toEqual(minimalConfig);
    });
  });
});
