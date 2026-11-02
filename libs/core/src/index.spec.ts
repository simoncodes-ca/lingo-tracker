import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as core from './index';
import * as errors from './lib/errors';

// Read consumers without loading app modules or their I/O side effects.
function consumerSources(library: string, appSpecs = false): string[] {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const sources: string[] = [];
  function visit(directory: string, app: boolean): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'testing') visit(path, app);
      } else if (path.endsWith('.ts')) {
        const spec = /\.(spec|test)\.ts$/.test(path);
        if (appSpecs ? app && spec : !spec) sources.push(readFileSync(path, 'utf8'));
      }
    }
  }
  for (const group of ['apps', 'libs']) {
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory() || (group === 'libs' && entry.name === library)) continue;
      const sourceRoot = join(root, group, entry.name, 'src');
      if (existsSync(sourceRoot)) visit(sourceRoot, group === 'apps');
    }
  }
  return sources;
}

function consumedNames(source: string, library: string): Set<string> {
  if (!source.includes(`@simoncodes-ca/${library}`)) return new Set();
  const parsed = ts.createSourceFile('consumer.ts', source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== `@simoncodes-ca/${library}`) continue;
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
    if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
      for (const binding of bindings.elements) names.add(binding.propertyName?.text ?? binding.name.text);
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text)
    ) {
      names.add(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      names.add(node.argumentExpression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return names;
}

// Each exception records why the name belongs to the public interface.
const CONTRACT_EXPORTS = {
  inspectImportSource: 'Public import preview contract: inspects source files before choosing a locale.',
  prepareExportRun: 'Public export preview contract: prepares resources without creating output directories.',
  writePreparedExport: 'Public export job contract: writes an existing prepared export with locale progress.',
  InvalidProjectTermsEditError: 'Callers can identify typed Project Terms refusal errors.',
  InvalidBaseValueError: 'Callers of addResource, addResources and editResource can identify invalid base values.',
  TranslationError: 'Implementers of the public TranslationProvider interface must throw this error.',
} as const;
const APP_SPEC_SETUP_EXPORTS = {
  openProjectCollection: 'API specs open destination collections while testing project mutation sinks.',
  openResourceFolder: 'API specs seed stored resource entries through the real ResourceFolder interface.',
} as const;

// Adding a name here is a deliberate API change: require a consumer or a reasoned exception.
// The errors sub-barrel owns its list; pin other runtime values here. Types are erased.
describe('core public surface', () => {
  it('exports exactly the listed runtime values', () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        ...Object.keys(errors),
        'CONFIG_FILENAME',
        'DEFAULT_CONFIG',
        'ResourceTreeIndex',
        'addBundleDefinition',
        'addCollection',
        'addLocaleToCollection',
        'addResource',
        'addResources',
        'assertCollectionFields',
        'assertImportableLocale',
        'assertProtectedTerms',
        'buildGlossary',
        'createFolder',
        'deleteBundleDefinition',
        'deleteCollection',
        'deleteFolder',
        'deleteResource',
        'detectImportFormat',
        'displayTermPath',
        'editCollectionTags',
        'editResource',
        'executeMove',
        'executeMoves',
        'exportTargetLocales',
        'extractResourcesRecursively',
        'generateBundles',
        'generatePreparedBundle',
        'hasFsErrorCode',
        'initProject',
        'inspectImportSource',
        'loadConfig',
        'normalizeCollections',
        'normalizeSearchRequest',
        'openCollection',
        'openProjectCollection',
        'openResourceFolder',
        'planBundle',
        'prepareBundleRun',
        'prepareExportRun',
        'prepareTranslationRun',
        'readCollection',
        'readProjectTermsView',
        'removeLocaleFromCollection',
        'runExport',
        'runImport',
        'runValidate',
        'searchResources',
        'summarizeImportRuns',
        'translateExistingResource',
        'updateBundleDefinition',
        'updateCollection',
        'updateProjectTerms',
        'writePreparedExport',
      ].sort(),
    );
  });
});

describe('public surface consumers', () => {
  it('requires an outside non-test consumer or a documented contract or app-spec setup exception', () => {
    const consumed = new Set(consumerSources('core').flatMap((source) => [...consumedNames(source, 'core')]));
    const appSpecConsumers = new Set(
      consumerSources('core', true).flatMap((source) => [...consumedNames(source, 'core')]),
    );
    for (const [name, reason] of Object.entries(CONTRACT_EXPORTS)) {
      expect(core, reason).toHaveProperty(name);
    }
    for (const [name, reason] of Object.entries(APP_SPEC_SETUP_EXPORTS)) {
      expect(core, reason).toHaveProperty(name);
      expect(appSpecConsumers.has(name), `${name}: ${reason}`).toBe(true);
    }
    const exceptions = new Set([...Object.keys(CONTRACT_EXPORTS), ...Object.keys(APP_SPEC_SETUP_EXPORTS)]);
    const unused = Object.keys(core)
      .filter((name) => !consumed.has(name) && !exceptions.has(name))
      .sort();
    expect(unused, `Unused @simoncodes-ca/core runtime exports: ${unused.join(', ')}`).toEqual([]);
  }, 30_000);

  it('recognizes aliases, re-exports and namespace members without counting comments or strings', () => {
    expect(
      [
        ...consumedNames(
          `
      import { addResource as add, type Collection } from '@simoncodes-ca/core';
      export { runImport as importResources } from '@simoncodes-ca/core';
      import * as core from '@simoncodes-ca/core';
      core.runExport();
      core['runValidate']();
      // import { normalize } from '@simoncodes-ca/core';
      const text = "import { initConfig } from '@simoncodes-ca/core'";
      import { validateKey } from '@simoncodes-ca/domain';
    `,
          'core',
        ),
      ].sort(),
    ).toEqual(['Collection', 'addResource', 'runExport', 'runImport', 'runValidate']);
  });
});
