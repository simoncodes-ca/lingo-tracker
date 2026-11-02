import type { BundlePlan, GenerateBundleResult } from '@simoncodes-ca/core';
import { MAX_CONFLICT_KEYS, mapBundlePlanToDto, mapGenerateBundleResultToJobResult } from './bundle.mapper';

describe('bundle.mapper', () => {
  describe('mapBundlePlanToDto', () => {
    const plan: BundlePlan = {
      bundleKey: 'main',
      locales: ['en', 'fr'],
      files: [
        {
          path: 'dist/en.json',
          absolutePath: '/w/dist/en.json',
          kind: 'bundle',
          locale: 'en',
          exists: true,
          keysCount: 3,
        },
        { path: 'dist/main.ts', absolutePath: '/w/dist/main.ts', kind: 'types', exists: false, keysCount: 3 },
      ],
      keysPerLocale: { en: 3, fr: 2 },
      conflictsCount: 60,
      conflictKeys: Array.from({ length: 60 }, (_, index) => `key.${index}`),
      hierarchicalConflicts: Array.from({ length: 60 }, (_, index) => `parent.${index}`),
      exampleKey: { collectionName: 'app', sourceKey: 'a.b', bundledKey: 'a.b', tokenPath: 'MAIN_TOKENS.A.B' },
      warnings: ['w'],
    };

    it('drops absolutePath and keeps locale only on bundle files', () => {
      const dto = mapBundlePlanToDto(plan);

      expect(dto.files[0]).toEqual({ path: 'dist/en.json', kind: 'bundle', locale: 'en', exists: true, keysCount: 3 });
      expect(dto.files[1]).toEqual({ path: 'dist/main.ts', kind: 'types', exists: false, keysCount: 3 });
      expect('absolutePath' in dto.files[0]).toBe(false);
      expect('locale' in dto.files[1]).toBe(false);
    });

    it('caps conflictKeys but reports the full conflictsCount', () => {
      const dto = mapBundlePlanToDto(plan);

      expect(dto.conflictKeys).toHaveLength(MAX_CONFLICT_KEYS);
      expect(dto.conflictsCount).toBe(60);
    });

    it('caps hierarchicalConflicts the same way as conflictKeys', () => {
      const dto = mapBundlePlanToDto(plan);

      expect(dto.hierarchicalConflicts).toHaveLength(MAX_CONFLICT_KEYS);
      expect(dto.hierarchicalConflicts[0]).toBe('parent.0');
    });

    it('maps name, locales, exampleKey and warnings', () => {
      const dto = mapBundlePlanToDto(plan);

      expect(dto.name).toBe('main');
      expect(dto.locales).toEqual(['en', 'fr']);
      expect(dto.exampleKey).toEqual(plan.exampleKey);
      expect(dto.warnings).toEqual(['w']);
      expect(dto.keysPerLocale).toEqual({ en: 3, fr: 2 });
    });

    it('omits exampleKey when the plan has none', () => {
      const dto = mapBundlePlanToDto({ ...plan, exampleKey: undefined });

      expect('exampleKey' in dto).toBe(false);
    });
  });

  describe('mapGenerateBundleResultToJobResult', () => {
    const result: GenerateBundleResult = {
      outcome: 'succeeded',
      bundleKey: 'main',
      filesGenerated: 2,
      writtenFiles: ['dist/i18n/main.en.json', 'dist/i18n/main.fr.json', 'dist/types/main.ts'],
      findings: {
        messages: ['Bundle empty for de'],
        byOrigin: { generation: ['Bundle empty for de'], config: [], type: [] },
        types: { status: 'written', path: 'dist/types/main.ts', keysCount: 4 },
      },
      localesProcessed: ['en', 'fr'],
      keysPerLocale: { en: 4, fr: 4 },
    };

    it('copies written paths and the types file metadata', () => {
      const dto = mapGenerateBundleResultToJobResult(result);

      expect(dto.filesGenerated).toEqual(['dist/i18n/main.en.json', 'dist/i18n/main.fr.json', 'dist/types/main.ts']);
      expect(dto.typeDistFile).toBe('dist/types/main.ts');
      expect(dto.typesKeysCount).toBe(4);
      expect(dto.localesProcessed).toEqual(['en', 'fr']);
      expect(dto.keysPerLocale).toEqual({ en: 4, fr: 4 });
      expect(dto.warnings).toEqual(['Bundle empty for de']);
    });

    it('keeps a debug-keys path in the reported file list', () => {
      const dto = mapGenerateBundleResultToJobResult({
        ...result,
        writtenFiles: [...result.writtenFiles, 'dist/i18n/main.99.json'],
      });

      expect(dto.filesGenerated).toContain('dist/i18n/main.99.json');
    });

    it('copies warnings independently of type metadata', () => {
      const warnings = ['first', 'second'];
      const dto = mapGenerateBundleResultToJobResult({
        ...result,
        findings: {
          messages: warnings,
          byOrigin: { generation: warnings, config: [], type: [] },
          types: { status: 'none' },
        },
        writtenFiles: result.writtenFiles.slice(0, 2),
      });

      expect(dto.filesGenerated).toHaveLength(2);
      expect('typeDistFile' in dto).toBe(false);
      expect('typesKeysCount' in dto).toBe(false);
      expect(dto.warnings).toEqual(['first', 'second']);
    });

    it('copies the core warning for a failed type file with the bundle key', () => {
      for (const bundleKey of ['main', 'second']) {
        const dto = mapGenerateBundleResultToJobResult({
          ...result,
          bundleKey,
          outcome: 'failed',
          findings: {
            messages: [...result.findings.messages, `Type generation failed for '${bundleKey}': disk full`],
            byOrigin: { ...result.findings.byOrigin, type: [`Type generation failed for '${bundleKey}': disk full`] },
            types: { status: 'failed', reason: 'disk full' },
          },
          writtenFiles: result.writtenFiles.slice(0, 2),
        });
        expect(dto.warnings).toEqual(['Bundle empty for de', `Type generation failed for '${bundleKey}': disk full`]);
        expect(dto.typeDistFile).toBeUndefined();
        expect(dto.typesKeysCount).toBeUndefined();
      }
    });

    it('merges config and run warnings without repeating the skipped type warning', () => {
      const warnings = ['generation warning'];
      const dto = mapGenerateBundleResultToJobResult({
        ...result,
        findings: {
          messages: [
            ...warnings,
            'prepared deprecation warning',
            "Type generation skipped for 'main': bundle is empty",
          ],
          byOrigin: {
            generation: warnings,
            config: ['prepared deprecation warning'],
            type: ["Type generation skipped for 'main': bundle is empty"],
          },
          types: { status: 'skipped', reason: 'bundle is empty' },
        },
        writtenFiles: result.writtenFiles.slice(0, 2),
      });
      expect(dto.warnings).toEqual([
        ...warnings,
        'prepared deprecation warning',
        "Type generation skipped for 'main': bundle is empty",
      ]);
      expect(dto.typeDistFile).toBeUndefined();
      expect(dto.typesKeysCount).toBeUndefined();
    });

    it('omits type fields when type generation did not run', () => {
      const dto = mapGenerateBundleResultToJobResult({
        ...result,
        writtenFiles: result.writtenFiles.slice(0, 2),
        findings: { ...result.findings, types: { status: 'none' } },
      });

      expect(dto.filesGenerated).toHaveLength(2);
      expect(dto.typeDistFile).toBeUndefined();
      expect(dto.warnings).toEqual(['Bundle empty for de']);
    });
  });
});
