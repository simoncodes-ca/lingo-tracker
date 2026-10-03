import {
  displayTermPath,
  InvalidProjectTermsEditError,
  type ProjectTermsEditProblem,
  type ProjectTermsUpdateResult,
  ProtectedTermsFileNotSetError,
  planProjectTermsUpdate,
} from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';

export interface ProtectedTermsOptions {
  collection?: string;
  add?: string[];
  remove?: string[];
  set?: string[];
  list?: boolean;
  /** Path to the protected terms file for this scope. An empty string clears the pointer. */
  file?: string;
}

const protectedEditWording: Record<ProjectTermsEditProblem, string | undefined> = {
  'protected-conflict': '--set cannot be combined with --add or --remove',
  'protected-missing': 'Provide at least one of --add, --remove, --set, --list, or --file',
  'protected-file-path': undefined,
  'protected-replacement-conflict': undefined,
  'preferred-missing': undefined,
  'preferred-conflict': undefined,
  'preferred-remove-shape': undefined,
  'preferred-replacement-shape': undefined,
  'preferred-upsert-shape': undefined,
};

export const protectedTermsCommand = defineCommand<ProtectedTermsOptions>()({
  name: 'Protected terms',
  // `--collection` is optional: absent means the global scope, so the runner opens nothing.
  collection: 'none',
  run: async ({ project, cwd, answers: options }) => {
    const hasAdd = (options.add ?? []).length > 0;
    const hasRemove = (options.remove ?? []).length > 0;
    const hasSet = options.set !== undefined;
    const hasList = options.list === true;
    const hasFile = options.file !== undefined;

    const collectionName = options.collection;
    const target = { collection: collectionName };
    let pointerLinePrinted = false;
    let result: ProjectTermsUpdateResult;
    try {
      const plan = planProjectTermsUpdate(project, {
        protectedTerms: {
          target,
          edit: {
            add: options.add,
            remove: options.remove,
            ...(hasSet && { set: options.set ?? [] }),
          },
          list: hasList,
          ...(hasFile && { file: options.file }),
        },
      });
      const { protectedTerms: view, protectedTermsFileChange } = plan.view;
      if (protectedTermsFileChange !== undefined) {
        ConsoleFormatter.success(protectedTermsFileChange.message);
        pointerLinePrinted = true;
      }
      if (view !== undefined) {
        // A named file that does not exist reads as empty; print its warning before a later write can fail.
        for (const warning of view.warnings) ConsoleFormatter.warning(warning);
      }
      if (view !== undefined && hasList) {
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
      result = plan.apply();
    } catch (error) {
      if (pointerLinePrinted) ConsoleFormatter.warning('Protected terms file change was reverted.');
      if (error instanceof InvalidProjectTermsEditError) {
        const message = protectedEditWording[error.problem];
        if (message !== undefined) throw new Error(message);
      }
      if (error instanceof ProtectedTermsFileNotSetError) {
        throw new Error(
          `Collection "${error.collectionName}" has no protected terms file. Set one first with --file <path>.`,
        );
      }
      throw error;
    }

    if (hasAdd || hasRemove || hasSet) {
      const written = result.protectedTermsResult;
      if (written === undefined) return;
      const scopeLabel = collectionName ? `Collection "${collectionName}"` : 'Global';
      const where = `(${displayTermPath(written.filePath, cwd)})`;
      ConsoleFormatter.success(
        written.terms.length === 0
          ? `${scopeLabel} protected terms cleared ${where}`
          : `${scopeLabel} protected terms updated: ${written.terms.join(', ')} ${where}`,
      );
    }
  },
});
