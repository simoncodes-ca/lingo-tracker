import { basename } from 'node:path';
import { effectiveProtectedTerms } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CollectionNotFoundError } from '../errors/lingo-tracker-error';
import type { OpenedProject } from './open-collection';
import { type LoadPreferredTerminologyResult, resolvePreferredTerminologyFile } from './preferred-terminology-file';
import { assertUsableProtectedFiles, readProjectTermFiles } from './project-term-files';
import {
  type ResolvedProtectedTerms,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFile,
} from './protected-terms-file';
import type { ProtectedTermsView } from './protected-terms-request';

/** The project config and all term scopes, read for one API response or CLI preview. */
export interface ProjectTermsConfigView {
  readonly config: LingoTrackerConfig;
  readonly projectName: string;
  readonly protectedTerms: ResolvedProtectedTerms;
  readonly preferredTerminology: LoadPreferredTerminologyResult;
}

export interface ProjectTermsView extends ProjectTermsConfigView {
  forConfig(): ProjectTermsConfigView;
  forTarget(target: { readonly collection?: string }): ProtectedTermsView;
}

/** Reads each configured scope without throwing for malformed term files or caching across requests. */
export function readProjectTermsView(project: OpenedProject): ProjectTermsView {
  const { sourceConfig: config, projectRoot: cwd } = project;
  const collections: ResolvedProtectedTerms['collections'] = {};
  // Preserve API refusal order: collection files before the global file.
  const scopes = Object.entries(config.collections).map(([name, collection]) => ({
    name,
    filePath: resolveCollectionProtectedTermsFilePath(collection, cwd),
  }));
  const globalFile = resolveGlobalProtectedTermsFile(config, cwd);
  const files = scopes.flatMap(({ filePath }) => (filePath === undefined ? [] : [{ path: filePath, explicit: true }]));
  const { protectedFiles, preferred, problems } = readProjectTermFiles(
    [...files, globalFile],
    resolvePreferredTerminologyFile(config, cwd),
  );
  let index = 0;
  for (const { name, filePath } of scopes) {
    collections[name] = { terms: filePath === undefined ? [] : (protectedFiles[index++]?.value ?? []), filePath };
  }
  const globalTerms = protectedFiles[index]?.value ?? [];
  const preferredTerminology = {
    rules: preferred.value,
    filePath: preferred.filePath,
    error: preferred.error,
    warning: preferred.warning,
  };
  const snapshot: ProjectTermsView = {
    config,
    projectName: basename(cwd),
    protectedTerms: { globalTerms, globalFilePath: globalFile.path, collections },
    preferredTerminology,
    forConfig: () => {
      assertUsableProtectedFiles(problems);
      return snapshot;
    },
    forTarget: (target) => {
      const { protectedTerms: resolved } = snapshot;
      const name = target.collection;
      if (name && config.collections[name] === undefined) throw new CollectionNotFoundError(name);
      const own = name ? resolved.collections[name] : undefined;
      const paths = [resolved.globalFilePath, own?.filePath];
      const relevant = problems.filter(
        (problem) => problem.file === 'protected-terms' && paths.includes(problem.filePath),
      );
      assertUsableProtectedFiles(paths.flatMap((path) => relevant.filter((problem) => problem.filePath === path)));
      const collectionTerms = own?.terms ?? [];
      return {
        globalTerms,
        collectionTerms,
        globalFilePath: resolved.globalFilePath,
        collectionFilePath: own?.filePath,
        effectiveTerms: effectiveProtectedTerms(globalTerms, collectionTerms),
        storedTerms: [...(name ? collectionTerms : globalTerms)],
        warnings: [
          ...new Set(
            paths.flatMap((path) =>
              relevant
                .filter((problem) => problem.filePath === path && problem.severity === 'warning')
                .map((problem) => problem.message),
            ),
          ),
        ],
      };
    },
  };
  return snapshot;
}
