import { basename } from 'node:path';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  loadPreferredTerminology,
  PreferredTerminologyValidationError,
  resolvePreferredTerminologyFilePath,
  resolveProtectedTermsForConfig,
  setGlobalProtectedTerms,
  writePreferredTerminology,
} from '@simoncodes-ca/core';
import * as mapper from '../mappers/config.mapper';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

jest.mock('@simoncodes-ca/core', () => {
  class PreferredTerminologyValidationError extends Error {
    constructor(readonly errors: unknown[]) {
      super('Invalid preferred terminology rules');
    }
  }
  return {
    setGlobalProtectedTerms: jest.fn(),
    resolveProtectedTermsForConfig: jest.fn(),
    loadPreferredTerminology: jest.fn(),
    resolvePreferredTerminologyFilePath: jest.fn(),
    writePreferredTerminology: jest.fn(),
    PreferredTerminologyValidationError,
  };
});

const TERMINOLOGY_PATH = '/project/.lingo-tracker-preferred-terminology.json';

/** Runs `fn`, expecting an HttpException, and returns it for status and body assertions. */
function catchHttpException(fn: () => unknown): HttpException {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Expected an HttpException');
}

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
    (loadPreferredTerminology as jest.Mock).mockReturnValue({ rules: [], filePath: TERMINOLOGY_PATH });
    (resolvePreferredTerminologyFilePath as jest.Mock).mockReturnValue(TERMINOLOGY_PATH);
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

      expect(mapSpy).toHaveBeenCalledWith(baseConfig, resolved, basename(process.cwd()), {
        rules: [],
        filePath: TERMINOLOGY_PATH,
      });
    });

    it('loads preferred terminology for the served config and exposes rules and path', () => {
      (loadPreferredTerminology as jest.Mock).mockReturnValue({
        rules: [{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' }],
        filePath: TERMINOLOGY_PATH,
      });

      const dto = controller.getConfig();

      expect(loadPreferredTerminology).toHaveBeenCalledWith(baseConfig, process.cwd());
      expect(dto.preferredTerminology).toEqual([
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' },
      ]);
      expect(dto.preferredTerminologyFilePath).toBe(TERMINOLOGY_PATH);
      expect(dto.preferredTerminologyError).toBeUndefined();
    });

    it('exposes a broken terminology file as preferredTerminologyError', () => {
      (loadPreferredTerminology as jest.Mock).mockReturnValue({
        rules: [],
        filePath: TERMINOLOGY_PATH,
        error: 'Preferred terminology file is not valid JSON',
      });

      const dto = controller.getConfig();

      expect(dto.preferredTerminology).toBeUndefined();
      expect(dto.preferredTerminologyError).toBe('Preferred terminology file is not valid JSON');
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

    it('exposes the served workspace folder name as projectName', () => {
      const dto = controller.getConfig();

      expect(dto.projectName).toBe(basename(process.cwd()));
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

    describe('preferredTerminology', () => {
      const rules = [
        { discouraged: 'Expenditure', preferred: 'Investment' },
        { discouraged: 'E-mail', preferred: 'email', reason: 'House style.' },
      ];

      it('writes the rule list to the resolved file and returns the standard message', () => {
        const result = controller.updateConfig({ preferredTerminology: rules });

        expect(resolvePreferredTerminologyFilePath).toHaveBeenCalledWith(baseConfig, process.cwd());
        expect(writePreferredTerminology).toHaveBeenCalledWith(TERMINOLOGY_PATH, rules);
        expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
        expect(result).toEqual({ message: 'Configuration updated successfully' });
      });

      it('writes an empty list, clearing the file', () => {
        controller.updateConfig({ preferredTerminology: [] });

        expect(writePreferredTerminology).toHaveBeenCalledWith(TERMINOLOGY_PATH, []);
      });

      it('leaves the terminology file alone when the field is absent', () => {
        controller.updateConfig({ protectedTerms: ['iPhone'] });

        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });

      it('writes both lists when both are sent', () => {
        controller.updateConfig({ protectedTerms: ['iPhone'], preferredTerminology: rules });

        expect(writePreferredTerminology).toHaveBeenCalledWith(TERMINOLOGY_PATH, rules);
        expect(setGlobalProtectedTerms).toHaveBeenCalledWith(['iPhone']);
      });

      it('rejects a non-array payload with 400', () => {
        const error = catchHttpException(() =>
          controller.updateConfig({ preferredTerminology: { discouraged: 'a', preferred: 'b' } } as never),
        );

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toBe('preferredTerminology must be an array of rules');
        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });

      it('answers invalid rules with 400 and per-row errors indexed by submitted row', () => {
        const error = catchHttpException(() =>
          controller.updateConfig({
            preferredTerminology: [
              { discouraged: 'Expenditure', preferred: 'Investment' },
              { discouraged: 'expenditure', preferred: 'Spend' },
              { discouraged: 'Cost', preferred: '' },
            ],
          }),
        );

        expect(error.getStatus()).toBe(400);
        const body = error.getResponse() as { message: string; errors: Array<{ index: number; code: string }> };
        expect(body.message).toBe('Invalid preferred terminology rules');
        expect(body.errors.map(({ index, code }) => ({ index, code }))).toEqual([
          { index: 1, code: 'duplicate' },
          { index: 2, code: 'empty' },
        ]);
        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });

      it('writes neither list when the rules are invalid, even with valid protected terms', () => {
        catchHttpException(() =>
          controller.updateConfig({
            protectedTerms: ['iPhone'],
            preferredTerminology: [{ discouraged: 'Email', preferred: 'email' }],
          }),
        );

        expect(setGlobalProtectedTerms).not.toHaveBeenCalled();
        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });

      it('writes neither list when protected terms are malformed', () => {
        catchHttpException(() =>
          controller.updateConfig({ protectedTerms: 'iPhone', preferredTerminology: rules } as never),
        );

        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });

      it('rejects rows of the wrong type as invalid-type', () => {
        const error = catchHttpException(() =>
          controller.updateConfig({ preferredTerminology: ['Expenditure'] } as never),
        );

        const body = error.getResponse() as { errors: Array<{ index: number; field: string; code: string }> };
        expect(body.errors).toEqual([expect.objectContaining({ index: 0, field: 'rule', code: 'invalid-type' })]);
      });

      it('maps a validation error thrown by the writer to the same 400 body', () => {
        const errors = [{ index: 0, field: 'preferred', code: 'chain', message: 'chain' }];
        (writePreferredTerminology as jest.Mock).mockImplementationOnce(() => {
          throw new PreferredTerminologyValidationError(errors as never);
        });

        const error = catchHttpException(() => controller.updateConfig({ preferredTerminology: rules }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({ message: 'Invalid preferred terminology rules', errors });
      });

      it('answers a write failure such as a missing directory with 400', () => {
        (writePreferredTerminology as jest.Mock).mockImplementationOnce(() => {
          throw new Error('Cannot write preferred terminology file — directory does not exist: /nope');
        });

        const error = catchHttpException(() => controller.updateConfig({ preferredTerminology: rules }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toBe('Cannot write preferred terminology file — directory does not exist: /nope');
      });

      it('answers a malformed file pointer in the config with 400 and writes nothing', () => {
        const message = '"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got number)';
        (resolvePreferredTerminologyFilePath as jest.Mock).mockImplementationOnce(() => {
          throw new Error(message);
        });

        const error = catchHttpException(() => controller.updateConfig({ preferredTerminology: rules }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toBe(message);
        expect(writePreferredTerminology).not.toHaveBeenCalled();
      });
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
