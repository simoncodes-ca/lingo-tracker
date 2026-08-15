import { setCollectionProtectedTerms, setGlobalProtectedTerms } from '@simoncodes-ca/core';
import { effectiveProtectedTerms, normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { loadConfiguration, ConsoleFormatter } from '../utils';

export interface ProtectedTermsOptions {
  collection?: string;
  add?: string[];
  remove?: string[];
  set?: string;
  list?: boolean;
}

export async function protectedTermsCommand(options: ProtectedTermsOptions): Promise<void> {
  const hasAdd = (options.add ?? []).length > 0;
  const hasRemove = (options.remove ?? []).length > 0;
  const hasSet = options.set !== undefined;
  const hasList = options.list === true;

  if (hasSet && (hasAdd || hasRemove)) {
    ConsoleFormatter.error('--set cannot be combined with --add or --remove');
    process.exit(1);
    return;
  }

  if (!hasAdd && !hasRemove && !hasSet && !hasList) {
    ConsoleFormatter.error('Provide at least one of --add, --remove, --set, or --list');
    process.exit(1);
    return;
  }

  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collectionName = options.collection;
  const collection = collectionName ? config.collections?.[collectionName] : undefined;
  if (collectionName && !collection) {
    ConsoleFormatter.error(`Collection "${collectionName}" not found`);
    process.exit(1);
    return;
  }

  const globalTerms = normalizeProtectedTerms(config.protectedTerms ?? []);
  const collectionTerms = collectionName ? normalizeProtectedTerms(collection?.protectedTerms ?? []) : [];

  if (hasList) {
    ConsoleFormatter.section('Protected Terms');
    if (collectionName) {
      ConsoleFormatter.keyValue('Scope', `Collection "${collectionName}" (global + collection)`);
      ConsoleFormatter.keyValue('Global', globalTerms.length > 0 ? globalTerms.join(', ') : '(none)');
      ConsoleFormatter.keyValue(
        'Collection-specific',
        collectionTerms.length > 0 ? collectionTerms.join(', ') : '(none)',
      );
      ConsoleFormatter.keyValue(
        'Effective',
        effectiveProtectedTerms(config.protectedTerms, collection?.protectedTerms).join(', ') || '(none)',
      );
    } else {
      ConsoleFormatter.keyValue('Scope', 'Global');
      ConsoleFormatter.keyValue('Terms', globalTerms.length > 0 ? globalTerms.join(', ') : '(none)');
    }
  }

  if (hasAdd || hasRemove || hasSet) {
    let next = collectionName ? collectionTerms : globalTerms;

    if (hasSet) {
      const value = options.set ?? '';
      next = normalizeProtectedTerms(value.split(','));
    } else {
      if (hasAdd) {
        for (const term of normalizeProtectedTerms(options.add ?? [])) {
          if (!next.includes(term)) {
            next.push(term);
          }
        }
      }
      if (hasRemove) {
        const toRemove = normalizeProtectedTerms(options.remove ?? []);
        next = next.filter((t) => !toRemove.includes(t));
      }
    }

    if (collectionName) {
      await setCollectionProtectedTerms(collectionName, next, { cwd });
    } else {
      setGlobalProtectedTerms(next, { cwd });
    }

    const scopeLabel = collectionName ? `Collection "${collectionName}"` : 'Global';
    if (next.length === 0) {
      ConsoleFormatter.success(`${scopeLabel} protected terms cleared`);
    } else {
      ConsoleFormatter.success(`${scopeLabel} protected terms updated: ${next.join(', ')}`);
    }
  }
}
