import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { setGlobalProtectedTerms } from '@simoncodes-ca/core';
import * as mapper from '../mappers/config.mapper';

jest.mock('@simoncodes-ca/core', () => ({
  setGlobalProtectedTerms: jest.fn(),
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
  });

  describe('getConfig', () => {
    it('exposes protectedTerms on the DTO', () => {
      configService.getConfig.mockReturnValue({
        ...baseConfig,
        protectedTerms: ['iPhone'],
      });

      const mapSpy = jest.spyOn(mapper, 'mapConfigToDto');
      controller.getConfig();
      expect(mapSpy).toHaveBeenCalledWith({ ...baseConfig, protectedTerms: ['iPhone'] });
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
