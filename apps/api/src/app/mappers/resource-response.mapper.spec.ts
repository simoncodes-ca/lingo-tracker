import type {
  AddResourcesResult,
  EditResourceResult,
  TerminologyFindings,
  TranslateExistingResourceResult,
} from '@simoncodes-ca/core';
import { collection, entry } from './resource.mapper.test-support';
import {
  mapCreateResourcesResultToDto,
  mapTranslateResourceResultToDto,
  mapUpdateResourceResultToDto,
} from './resource-response.mapper';

const noTerminology: TerminologyFindings = { findings: [], problems: [] };
const finding = {
  key: 'app.save',
  discouraged: 'Expenditure',
  preferred: 'Investment',
  message: 'consider "Investment" instead of "Expenditure"',
};
const createResult: AddResourcesResult = {
  entriesCreated: 2,
  created: true,
  skippedLocales: [],
  terminology: noTerminology,
};
const translateResult: TranslateExistingResourceResult = {
  entry,
  translatedCount: 1,
  skippedLocales: [],
  warnings: [],
};

describe('mapTranslateResourceResultToDto', () => {
  it('omits empty warnings and always includes empty skipped locales', () => {
    const dto = mapTranslateResourceResultToDto(translateResult, 'app.save', collection);
    expect(Object.keys(dto)).toEqual(['resource', 'skippedLocales', 'translatedCount']);
    expect(dto.skippedLocales).toStrictEqual([]);
    expect(dto.translatedCount).toBe(1);
    expect(dto.resource).toStrictEqual({
      fullKey: 'app.save',
      folderPath: 'app',
      entryKey: 'save',
      base: { locale: 'en', value: 'Save' },
      targets: [{ locale: 'fr', value: 'Enregistrer', status: 'translated', needsWork: false, sameAsBase: false }],
      tags: [],
      inheritedTags: ['collection'],
    });
  });

  it('includes nonempty warnings and skipped locales in the original field order', () => {
    const result = { ...translateResult, warnings: ['Missing terms'], skippedLocales: ['fr'] };
    const dto = mapTranslateResourceResultToDto(result, 'app.save', collection);
    expect(Object.keys(dto)).toEqual(['resource', 'skippedLocales', 'translatedCount', 'warnings']);
    expect(dto.warnings).toBe(result.warnings);
    expect(dto.skippedLocales).toBe(result.skippedLocales);
  });
});

describe('mapCreateResourcesResultToDto', () => {
  it('omits empty skipped locales and terminology', () => {
    expect(mapCreateResourcesResultToDto(createResult)).toStrictEqual({ entriesCreated: 2, created: true });
  });

  it('includes nonempty skipped locales, copies terminology, and preserves field order', () => {
    const result = {
      ...createResult,
      skippedLocales: ['fr'],
      terminology: { findings: [finding], problems: ['Broken rules'] },
    };
    const dto = mapCreateResourcesResultToDto(result);
    expect(Object.keys(dto)).toEqual(['entriesCreated', 'created', 'skippedLocales', 'terminology']);
    expect(dto.skippedLocales).toBe(result.skippedLocales);
    expect(dto.terminology).toStrictEqual(result.terminology);
    expect(dto.terminology?.findings).not.toBe(result.terminology.findings);
    expect(dto.terminology?.problems).not.toBe(result.terminology.problems);
  });

  it('includes terminology when either findings or problems alone are present', () => {
    for (const terminology of [
      { findings: [finding], problems: [] },
      { findings: [], problems: ['Broken rules'] },
    ]) {
      expect(mapCreateResourcesResultToDto({ ...createResult, terminology }).terminology).toStrictEqual(terminology);
    }
  });
});

describe('mapUpdateResourceResultToDto', () => {
  const result: EditResourceResult = { resolvedKey: 'destination.save', updated: true, entry };

  it('retains undefined message, resource and skippedLocales as own fields', () => {
    const dto = mapUpdateResourceResultToDto({ resolvedKey: 'app.save', updated: false }, collection);
    expect(dto).toStrictEqual({
      resolvedKey: 'app.save',
      updated: false,
      message: undefined,
      resource: undefined,
      skippedLocales: undefined,
    });
    expect(Object.keys(dto)).toEqual(['resolvedKey', 'updated', 'message', 'resource', 'skippedLocales']);
    expect(JSON.stringify(dto)).toBe('{"resolvedKey":"app.save","updated":false}');
  });

  it('omits empty terminology', () => {
    expect(mapUpdateResourceResultToDto({ ...result, terminology: noTerminology }, collection)).not.toHaveProperty(
      'terminology',
    );
  });

  it('maps the resolved address and passes through empty and nonempty skipped locales', () => {
    for (const skippedLocales of [[], ['fr']]) {
      const dto = mapUpdateResourceResultToDto({ ...result, message: 'Updated', skippedLocales }, collection);
      expect(dto.resource?.fullKey).toBe('destination.save');
      expect(dto.resource?.folderPath).toBe('destination');
      expect(dto.skippedLocales).toBe(skippedLocales);
      expect(dto.message).toBe('Updated');
    }
  });

  it('requires both an updated result and an entry to include the resource', () => {
    expect(mapUpdateResourceResultToDto({ ...result, updated: false }, collection).resource).toBeUndefined();
    expect(mapUpdateResourceResultToDto({ ...result, entry: undefined }, collection).resource).toBeUndefined();
  });

  it('includes copied terminology when either findings or problems are present', () => {
    for (const terminology of [
      { findings: [finding], problems: [] },
      { findings: [], problems: ['Broken rules'] },
    ]) {
      const dto = mapUpdateResourceResultToDto({ ...result, terminology }, collection);
      expect(dto.terminology).toStrictEqual(terminology);
      expect(dto.terminology?.findings).not.toBe(terminology.findings);
      expect(dto.terminology?.problems).not.toBe(terminology.problems);
      expect(Object.keys(dto)).toEqual([
        'resolvedKey',
        'updated',
        'message',
        'resource',
        'skippedLocales',
        'terminology',
      ]);
    }
  });
});
