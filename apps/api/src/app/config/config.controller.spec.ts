import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { resolveProtectedTermsForConfig, setGlobalProtectedTerms } from '@simoncodes-ca/core';
import * as mapper from '../mappers/config.mapper';

jest.mock('@simoncodes-ca/core', () => ({
  setGlobalProtectedTerms: jest.fn(),
  resolveProtectedTermsForConfig: jest.fn(),
}));

describe('ConfigController', () => {
  let moduleRef: TestingModule;
  let controller: ConfigController;

  const baseConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'es'],
    collections: {
      app: { translationsFolder: './i18n' },
    },
  };

  const configService = {
    getConfig: jest.fn(),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [{ provide: ConfigService, useValue: configService }],
    }).compile();

    controller = moduleRef.get<ConfigController>(ConfigController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getConfig.mockReturnValue(baseConfig);
    (resolveProtectedTermsForConfig as jest.Mock).mockReturnValue({
      globalTerms: [],
      globalFilePath: '/project/.lingo-tracker-protected-terms.json',
      collections: {},
    });
  });

  describe('getConfig', () => {
    it('passes the terms resolved from disk to the mapper', () => {
      const resolved = {
        globalTerms: ['iPhone'],
        globalFilePath: '/project/.lingo-tracker-protected-terms.json',
        collections: {},
      };
      (resolveProtectedTermsForConfig as jest.Mock).mockReturnValue(resolved);

      const mapSpy = jest.spyOn(mapper, 'mapConfigToDto');
      controller.getConfig();

      expect(mapSpy).toHaveBeenCalledWith(baseConfig, resolved);
    });

    it('exposes the resolved terms and their file path on the DTO', () => {
      (resolveProtectedTermsForConfig as jest.Mock).mockReturnValue({
        globalTerms: ['iPhone'],
        globalFilePath: '/project/.lingo-tracker-protected-terms.json',
        collections: {},
      });

      const dto = controller.getConfig();

      expect(dto.protectedTerms).toEqual(['iPhone']);
      expect(dto.protectedTermsFilePath).toBe('/project/.lingo-tracker-protected-terms.json');
    });
  });

  describe('updateConfig', () => {
    it('updates the global protected-terms list and returns a message', () => {
      const result = controller.updateConfig({ protectedTerms: ['iPhone'] });

      expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['iPhone']);
      expect(result).toEqual({ message: 'Configuration updated successfully' });
    });

    it('is a no-op when the body carries no writable fields', () => {
      const result = controller.updateConfig({});

      expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Configuration updated successfully' });
    });

    it('throws 400 when protectedTerms is not a string array', () => {
      expect(() => controller.updateConfig({ protectedTerms: 'iPhone' } as never)).toThrow(HttpException);
      expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
      try {
        controller.updateConfig({ protectedTerms: 'iPhone' } as never);
      } catch (error: unknown) {
        expect((error as HttpException).getStatus()).toBe(400);
      }
    });

    it('throws HttpException with status 400 when the update fails', () => {
      const setter = setGlobalProtectedTerms as jest.Mock;
      setter.mockImplementationOnce(() => {
        throw new Error('update failed');
      });

      expect(() => controller.updateConfig({ protectedTerms: ['iPhone'] })).toThrow(HttpException);
      try {
        controller.updateConfig({ protectedTerms: ['iPhone'] });
      } catch (error: unknown) {
        expect((error as HttpException).getStatus()).toBe(400);
      }
    });
  });
});
