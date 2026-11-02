import { displayTermPath, updateProjectTerms } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { PROTECTED_TERMS_FLAGS } from './protected-terms-flags';
import { protectedTermsRequestFromFlags } from './protected-terms-request';

export interface ProtectedTermsOptions {
  collection?: string;
  add?: string[];
  remove?: string[];
  set?: string[];
  list?: boolean;
  /** Path to the protected terms file for this scope. An empty string clears the pointer. */
  file?: string;
}

export const protectedTermsCommand = defineCommand<ProtectedTermsOptions>()({
  flags: PROTECTED_TERMS_FLAGS,
  name: 'Protected terms',
  // `--collection` is optional: absent means the global scope, so the runner opens nothing.
  collection: 'none',
  run: async ({ project, cwd, answers: options }) => {
    const collectionName = options.collection;
    const result = updateProjectTerms(
      project,
      { protectedTerms: protectedTermsRequestFromFlags(options) },
      {
        onPreview: ({ protectedTerms: view, protectedTermsFileChange, lists }) => {
          if (protectedTermsFileChange !== undefined) {
            ConsoleFormatter.success(protectedTermsFileChange.message);
          }
          if (view !== undefined) {
            // A named file that does not exist reads as empty; print its warning before a later write can fail.
            for (const warning of view.warnings) ConsoleFormatter.warning(warning);
          }
          if (view !== undefined && lists.protectedTerms) {
            ConsoleFormatter.section('Protected Terms');
            if (collectionName) {
              ConsoleFormatter.keyValue('Scope', `Collection "${collectionName}" (global + collection)`);
              ConsoleFormatter.keyValue('Global file', displayTermPath(view.globalFilePath, cwd));
              ConsoleFormatter.keyValue('Global', view.globalTerms.join(', ') || '(none)');
              ConsoleFormatter.keyValue(
                'Collection file',
                view.collectionFilePath ? displayTermPath(view.collectionFilePath, cwd) : '(none)',
              );
              ConsoleFormatter.keyValue('Collection-specific', view.collectionTerms.join(', ') || '(none)');
              ConsoleFormatter.keyValue('Effective', view.effectiveTerms.join(', ') || '(none)');
            } else {
              ConsoleFormatter.keyValue('Scope', 'Global');
              ConsoleFormatter.keyValue('File', displayTermPath(view.globalFilePath, cwd));
              ConsoleFormatter.keyValue('Terms', view.globalTerms.join(', ') || '(none)');
            }
          }
        },
      },
    );
    if (result.status === 'failed' && result.view.protectedTermsFileChange !== undefined && result.reverted) {
      ConsoleFormatter.warning('Protected terms file change was reverted.');
    }
    if (result.status === 'failed' || result.status === 'refused') throw result.error;

    const written = result.status === 'changed' ? result.written.protectedTermsResult : undefined;
    if (written !== undefined) {
      const scopeLabel = collectionName ? `Collection "${collectionName}"` : 'Global';
      const where = `(${displayTermPath(written.filePath, cwd)})`;
      ConsoleFormatter.success(
        written.action === 'cleared'
          ? `${scopeLabel} protected terms cleared ${where}`
          : `${scopeLabel} protected terms updated: ${written.terms.join(', ')} ${where}`,
      );
    }
  },
});
