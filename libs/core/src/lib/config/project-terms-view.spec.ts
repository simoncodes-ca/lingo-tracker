import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { CollectionNotFoundError, ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import { readProjectTermsView } from './project-terms-view';

describe('readProjectTermsView', () => {
  const cwd = useTempDir();
  const project = () => ({
    projectRoot: cwd(),
    sourceConfig: {
      baseLocale: 'en',
      locales: ['en'],
      exportFolder: 'export',
      importFolder: 'import',
      protectedTermsFile: 'global.json',
      preferredTerminologyFile: 'preferred.json',
      collections: {
        app: { translationsFolder: 'i18n', protectedTermsFile: 'own.json' },
        inherited: { translationsFolder: 'other' },
      },
    },
  });

  it('returns config, terms, paths, and warnings for every scope', () => {
    writeFileSync(join(cwd(), 'global.json'), '["Global"]');
    writeFileSync(join(cwd(), 'preferred.json'), '[{"discouraged":"Old","preferred":"New"}]');
    const view = readProjectTermsView(project());
    expect(view.config).toEqual(project().sourceConfig);
    expect(view.projectName).toBe(basename(cwd()));
    expect(view.protectedTerms.globalTerms).toEqual(['Global']);
    expect(view.protectedTerms.collections['app'].filePath).toBe(join(cwd(), 'own.json'));
    expect(view.protectedTerms.collections['inherited']).toEqual({ terms: [], filePath: undefined });
    expect(view.preferredTerminology.rules).toEqual([{ discouraged: 'Old', preferred: 'New' }]);
    expect(view.forTarget({ collection: 'app' }).warnings).toEqual([expect.stringContaining('own.json')]);
  });

  it('reports broken files but only refuses protected scopes that use them', () => {
    writeFileSync(join(cwd(), 'own.json'), '{bad');
    writeFileSync(join(cwd(), 'preferred.json'), '{bad');
    const view = readProjectTermsView(project());
    expect(view.preferredTerminology.error).toContain('not valid JSON');
    expect(view.forTarget({}).globalTerms).toEqual([]);
    expect(() => view.forTarget({ collection: 'app' })).toThrow(ProtectedTermsFileError);
  });

  it('reads fresh files on each invocation and computes the selected effective union', () => {
    writeFileSync(join(cwd(), 'global.json'), '["Global"]');
    writeFileSync(join(cwd(), 'own.json'), '["Own"]');
    const first = readProjectTermsView(project());
    writeFileSync(join(cwd(), 'own.json'), '["Changed"]');
    expect(first.forTarget({ collection: 'app' }).effectiveTerms).toEqual(['Global', 'Own']);
    expect(readProjectTermsView(project()).forTarget({ collection: 'app' }).storedTerms).toEqual(['Changed']);
  });

  it('reads every scope in one pass, reporting terms and paths', () => {
    writeFileSync(join(cwd(), '.lingo-tracker-protected-terms.json'), '["SimonCodes"]');
    writeFileSync(join(cwd(), 'app-terms.json'), '["iPhone"]');
    const sourceConfig = {
      ...project().sourceConfig,
      protectedTermsFile: undefined,
      collections: {
        app: { translationsFolder: './i18n', protectedTermsFile: 'app-terms.json' },
        other: { translationsFolder: './other' },
      },
    };
    const resolved = readProjectTermsView({ projectRoot: cwd(), sourceConfig }).protectedTerms;
    expect(resolved.globalTerms).toEqual(['SimonCodes']);
    expect(resolved.globalFilePath).toBe(join(cwd(), '.lingo-tracker-protected-terms.json'));
    expect(resolved.collections['app']).toEqual({ terms: ['iPhone'], filePath: join(cwd(), 'app-terms.json') });
    expect(resolved.collections['other']).toEqual({ terms: [], filePath: undefined });
  });

  it('reports a malformed file and rejects its scope exactly as a direct read would', () => {
    writeFileSync(join(cwd(), 'global.json'), '{ "terms": [] }');
    const snapshot = readProjectTermsView(project());
    expect(() => snapshot.forTarget({})).toThrow(expect.objectContaining({ filePath: join(cwd(), 'global.json') }));
    expect(() => snapshot.forConfig()).toThrow(ProtectedTermsFileError);
    expect(() => snapshot.forTarget({})).toThrow(ProtectedTermsFileError);
  });

  it('keeps API and selected-scope refusal order behind their intents', () => {
    writeFileSync(join(cwd(), 'global.json'), '{bad');
    writeFileSync(join(cwd(), 'own.json'), '{bad');
    const snapshot = readProjectTermsView(project());
    expect(() => snapshot.forConfig()).toThrow(expect.objectContaining({ filePath: join(cwd(), 'own.json') }));
    expect(() => snapshot.forTarget({ collection: 'app' })).toThrow(
      expect.objectContaining({ filePath: join(cwd(), 'global.json') }),
    );
  });

  it('returns preferred-file failures as config data without rejecting the API view', () => {
    writeFileSync(join(cwd(), 'preferred.json'), '{bad');
    const view = readProjectTermsView(project()).forConfig();
    expect(view.preferredTerminology.error).toContain('not valid JSON');
    expect(view.preferredTerminology.rules).toEqual([]);
  });

  it('rejects an unknown collection with CollectionNotFoundError', () => {
    expect(() => readProjectTermsView(project()).forTarget({ collection: 'missing' })).toThrow(CollectionNotFoundError);
  });

  it('returns warnings, stored lists, and the effective union before an edit', () => {
    writeFileSync(join(cwd(), 'own.json'), '["Pixel"]');
    const sourceConfig = { ...project().sourceConfig, protectedTermsFile: 'missing.json' };
    const read = () => readProjectTermsView({ projectRoot: cwd(), sourceConfig }).forTarget({ collection: 'app' });
    const view = read();
    expect(view.warnings).toEqual([
      `Protected terms file not found: ${join(cwd(), 'missing.json')}. Treating as an empty list.`,
    ]);
    expect(view.globalTerms).toEqual([]);
    expect(view.collectionTerms).toEqual(['Pixel']);
    expect(view.storedTerms).toEqual(['Pixel']);
    expect(view.effectiveTerms).toEqual(['Pixel']);
    expect(view.globalFilePath).toBe(join(cwd(), 'missing.json'));
    expect(view.collectionFilePath).toBe(join(cwd(), 'own.json'));
    writeFileSync(join(cwd(), 'missing.json'), '["iPhone"]');
    expect(read().warnings).toEqual([]);
    expect(read().effectiveTerms).toEqual(['iPhone', 'Pixel']);
  });
});
