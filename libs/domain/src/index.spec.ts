// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as domain from './index';

// Read consumers without loading app modules or their I/O side effects.
function consumerSources(library: string): string[] {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const sources: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'testing') visit(path);
      } else if (path.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(path)) {
        sources.push(readFileSync(path, 'utf8'));
      }
    }
  }
  for (const group of ['apps', 'libs']) {
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory() || (group === 'libs' && entry.name === library)) continue;
      const sourceRoot = join(root, group, entry.name, 'src');
      if (existsSync(sourceRoot)) visit(sourceRoot);
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

// The barrel is the library's interface. Adding a name here is a deliberate API change:
// export it only when something outside libs/domain needs it. Types are erased, so only values appear.
describe('domain public surface', () => {
  it('requires an outside non-test consumer for every runtime export', () => {
    const consumed = new Set(consumerSources('domain').flatMap((source) => [...consumedNames(source, 'domain')]));
    // inferImportLocale is the public import preview contract for the upcoming UI/API consumers.
    // Runtime bundle conversion and renderability checks are public contracts for #151's next slice.
    const upcomingRuntimeConsumers = ['toRuntimeValue', 'unrenderableIcuConstructs'];
    const unused = Object.keys(domain)
      .filter((name) => !consumed.has(name) && name !== 'inferImportLocale' && !upcomingRuntimeConsumers.includes(name))
      .sort();
    expect(unused, `Unused @simoncodes-ca/domain runtime exports: ${unused.join(', ')}`).toEqual([]);
  }, 30_000);

  it('exports exactly the listed runtime values', () => {
    expect(Object.keys(domain).sort()).toEqual([
      'APP_RUNTIMES',
      'CONFIG_FILENAME',
      'CONVERSION_SAFETY_RULES',
      'DEFAULT_APP_RUNTIME',
      'DEFAULT_BUNDLE_DIST',
      'DEFAULT_BUNDLE_NAME',
      'DEFAULT_CONFIG',
      'DEFAULT_EXPORT_BASE_PROPERTY_NAME',
      'DEFAULT_IMPORT_STRATEGY',
      'DEFAULT_MISSING_METADATA_STATUS',
      'DEFAULT_TYPE_DIST_FILE',
      'IMPORT_STRATEGIES',
      'NEEDS_WORK_STATUSES',
      'STATUS_PRECEDENCE',
      'TRANSLATION_STATUSES',
      'admitValue',
      'applyBaseChange',
      'applyPreferredTerm',
      'assertStringArray',
      'buildKeyTree',
      'buildResourceSummary',
      'bundleKeyToConstantName',
      'bundleOutputFile',
      'bundledFormIfLost',
      'canImportLocale',
      'checkBundleDefinition',
      'checkStoredValue',
      'checkTranslatedValue',
      'classifyICUContent',
      'collectAncestorPaths',
      'countByStatus',
      'describeStoredValueFinding',
      'describeValueViolation',
      'detectDuplicateKeys',
      'detectHierarchicalConflicts',
      'displayStatus',
      'effectiveProtectedTerms',
      'effectiveTags',
      'entryChange',
      'escapeRegExp',
      'exportOptionsPolicy',
      'findBundleDefinition',
      'findCollectionEntry',
      'findPreferredTermFindings',
      'findProtectedTerms',
      'folderPathFromSegments',
      'folderPathLeaf',
      'folderPathSegments',
      'hasBundleCollections',
      'hasBundleRules',
      'hasLocalePlaceholder',
      'hasQuotedInterpolationDelimiter',
      'hasTypeDistConfigured',
      'hasUnbundlableBranchBody',
      'honouredImportSourceStatus',
      'icuParseOptionsFor',
      'icuQuotedRuns',
      'importStrategyPolicy',
      'importableLocales',
      'inferImportLocale',
      'inheritCollectionSettings',
      'isAppRuntime',
      'isDescendantFolderPath',
      'isEmptyValue',
      'isFolderPathUnder',
      'isIcuLocaleSupported',
      'isImportStrategy',
      'isKeyTooLong',
      'isNeedsWorkStatus',
      'isNeedsWorkStatusSelection',
      'isTranslationStatus',
      'isTypeScriptFile',
      'isUnderNodeModules',
      'isUntranslatedCopy',
      'isValidJavaScriptIdentifier',
      'isValidSegment',
      'joinFolderPath',
      'mergeListEdit',
      'needsTranslation',
      'normalizeBundleDefinition',
      'normalizePreferredTermRules',
      'normalizeProtectedTerms',
      'normalizeTag',
      'normalizeTags',
      'normalizedLevenshtein',
      'parentFolderPath',
      'parseTranslationInputs',
      'rebaseFolderPath',
      'recordTranslation',
      'repairPlaceholders',
      'resolveAllReferences',
      'resolveImportStatus',
      'resolveResourceKey',
      'sortPreferredTermRules',
      'splitResolvedKey',
      'statusCountsOver',
      'summaryTarget',
      'toRuntimeValue',
      'toStoredIcu',
      'translocoToICU',
      'unrenderableIcuConstructs',
      'validateICUSyntax',
      'validateImportKey',
      'validateJavaScriptIdentifier',
      'validateKey',
      'validateListEdit',
      'validateLocale',
      'validatePreferredTermRules',
      'validateTargetFolder',
      'worstStatus',
    ]);
  });
});
