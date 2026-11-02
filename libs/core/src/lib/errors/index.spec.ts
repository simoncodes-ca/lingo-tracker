import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as core from '../../index';
import * as errors from './index';
import * as internalErrors from './internal';
import { LingoTrackerError } from './lingo-tracker-error';

// Discover modules independently of the barrel, including future error files.
const modules = import.meta.glob<Record<string, unknown>>(['./**/*.ts', '!./**/*.spec.ts'], { eager: true });

// Read source rather than importing every core module, which can have I/O side effects.
const sources = import.meta.glob<string>(['../../**/*.ts', '!../../**/*.spec.ts', '!../../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const errorNames = new Set(
  Object.entries(internalErrors)
    .filter(
      ([, value]) =>
        typeof value === 'function' && (value === LingoTrackerError || value.prototype instanceof LingoTrackerError),
    )
    .map(([name]) => name),
);

function findErrorClasses(source: string): string[] {
  const parsed = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const aliases = new Map<string, string>();
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const imported of bindings.elements) {
        aliases.set(imported.name.text, imported.propertyName?.text ?? imported.name.text);
      }
    }
  }
  const found: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const heritage of node.heritageClauses ?? []) {
        if (heritage.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const base of heritage.types) {
          const expression = base.expression;
          const name = ts.isIdentifier(expression)
            ? (aliases.get(expression.text) ?? expression.text)
            : ts.isPropertyAccessExpression(expression)
              ? expression.name.text
              : undefined;
          if (name && errorNames.has(name)) found.push(node.name?.text ?? '(anonymous)');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return found;
}

describe('core error exports', () => {
  it('keeps public exports and every discovered error subclass in internal', () => {
    for (const [name, value] of Object.entries(errors)) {
      expect(internalErrors).toHaveProperty(name, value);
    }
    const subclasses = Object.values(modules).flatMap((module) =>
      Object.entries(module).filter(
        ([, value]) => typeof value === 'function' && value.prototype instanceof LingoTrackerError,
      ),
    );
    expect(subclasses.length).toBeGreaterThan(0);
    for (const [name, value] of subclasses) {
      expect(internalErrors).toHaveProperty(name, value);
    }
  });

  it('exports public errors from the same errors barrel', () => {
    // The public surface deliberately exports only names used outside core.
    // src/index.spec.ts pins that subset; internal subclasses stay internal.
    for (const [name, value] of Object.entries(core)) {
      if (typeof value === 'function' && value.prototype instanceof LingoTrackerError) {
        expect(errors).toHaveProperty(name, value);
      }
    }
    expect(core.LingoTrackerError).toBe(errors.LingoTrackerError);
  });

  it('defines all core error subclasses inside errors/', () => {
    const covered = Object.keys(sources).map((file) => new URL(file, import.meta.url).href);
    expect(covered).toContain(new URL('../machine-translation/translation-provider.ts', import.meta.url).href);
    expect(covered).toContain(new URL('../config/preferred-terminology-file.ts', import.meta.url).href);
    expect(covered).toContain(new URL('../../collections-manager/add-collection.ts', import.meta.url).href);
    const outside = Object.entries(sources)
      .filter(([file]) => !new URL(file, import.meta.url).href.startsWith(new URL('.', import.meta.url).href))
      .flatMap(([file, source]) => findErrorClasses(source).map((name) => `${file}: ${name}`));
    expect(outside).toEqual([]);
  });

  it('detects relocated errors through the base class, subclass, import alias, or namespace', () => {
    expect(
      findErrorClasses(`
      import { LingoTrackerError as Base } from '../errors';
      // class Comment extends LingoTrackerError {}
      class Direct extends LingoTrackerError {}
      class Indirect extends InvalidBundleDefinitionError {}
      class Aliased extends Base {}
      class Namespaced extends errors.TranslationError {}
      class Ordinary extends Error {}
    `),
    ).toEqual(['Direct', 'Indirect', 'Aliased', 'Namespaced']);
  });
});
