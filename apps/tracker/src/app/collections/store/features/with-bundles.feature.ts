import { computed, DestroyRef, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, type, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type {
  BundleDefinitionDto,
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  CreateBundleDto,
  LingoTrackerConfigDto,
  UpdateBundleDto,
} from '@simoncodes-ca/data-transfer';
import { type Observable, tap, timer } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SESSION_STORAGE } from '../../../shared/storage/browser-storage';
import { json, KeyedStorage } from '../../../shared/storage/keyed-storage';
import { CollectionsApiService } from '../../services/collections-api.service';
import { BUNDLE_RUNS_STORAGE_KEY, BundleBatchController } from '../bundle-batch-controller';
import { type BundleRunState, readPersistedRuns } from '../bundle-runs';
import { injectConfigWrite } from '../config-write';

export interface BundleEntry {
  name: string;
  definition: BundleDefinitionDto;
}

interface BundlesState {
  /** Generation run state keyed by bundle name. */
  bundleRuns: Record<string, BundleRunState>;
  /** Names actually started by the last Generate all request; not persisted. */
  bundleBatch: readonly string[];
  batchPosition: number;
  isBatchRunning: boolean;
}

const initialBundlesState: BundlesState = {
  bundleRuns: {},
  bundleBatch: [],
  batchPosition: 1,
  isBatchRunning: false,
};

/**
 * Adds bundle definitions and bundle generation runs to the collections store.
 *
 * The definition mutations are Config Writes (`../config-write.ts`): each returns the
 * reloaded config, or errors with the `ApiError` of the rejected write. Requires `config`
 * and `error` in the host store state.
 */
export function withBundlesFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{ config: LingoTrackerConfigDto | null; error: string | null }>(),
    },
    withState(initialBundlesState),
    withComputed(({ config, bundleRuns, bundleBatch }) => {
      const bundleEntries = computed<BundleEntry[]>(() => {
        const bundles = config()?.bundles;
        if (!bundles) return [];
        return Object.entries(bundles)
          .map(([name, definition]) => ({ name, definition }))
          .sort((a, b) => a.name.localeCompare(b.name));
      });

      const runningBundleCount = computed(
        () => Object.values(bundleRuns()).filter((run) => run.status === 'running').length,
      );

      return {
        /** Bundles from the config as a name-sorted array. */
        bundleEntries,
        hasBundles: computed(() => bundleEntries().length > 0),
        bundleCount: computed(() => bundleEntries().length),
        /** Project name reported by the API (basename of its working directory). */
        projectName: computed(() => config()?.projectName ?? null),
        batchTotal: computed(() => bundleBatch().length),
        runningBundleCount,
        isAnyBundleRunning: computed(() => runningBundleCount() > 0),
      };
    }),
    withMethods((store) => {
      const api = inject(CollectionsApiService);
      const transloco = inject(TranslocoService);
      const configWrite = injectConfigWrite(store);
      const storage = new KeyedStorage<Record<string, BundleRunState>>(
        inject(SESSION_STORAGE),
        BUNDLE_RUNS_STORAGE_KEY,
        json(readPersistedRuns),
      );

      const controller = new BundleBatchController(
        {
          generate: (name, locales) => api.generateBundle(name, locales ? { locales } : {}),
          getJob: (jobId) => api.getBundleJob(jobId),
          failureMessage: () => transloco.translate(TRACKER_TOKENS.BUNDLES.TOAST.GENERATEFAILED),
        },
        storage,
        { now: () => new Date().toISOString(), poll: (ms) => timer(ms, ms) },
      );
      const subscription = controller.changes.subscribe((state) => patchState(store, state));
      inject(DestroyRef).onDestroy(() => {
        subscription.unsubscribe();
        controller.destroy();
      });
      const generateBundle = (name: string, locales?: readonly string[]): void => {
        controller.start(name, locales, store.config()?.locales?.length ?? 0);
      };

      return {
        /** Plans a bundle without changing config or writing output files. */
        dryRunBundle(request: BundleDryRunRequestDto): Observable<BundleDryRunResultDto> {
          return api.dryRunBundle(request);
        },
        /** Creates a bundle definition. A taken name errors with a `conflict`; a definition the rules reject with an `invalid` whose `details` are the rule messages. */
        createBundle(data: CreateBundleDto): Observable<LingoTrackerConfigDto | null> {
          return configWrite(api.createBundle(data));
        },

        /** Updates the bundle `name` names; `update.name` renames it. */
        updateBundle(name: string, update: UpdateBundleDto): Observable<LingoTrackerConfigDto | null> {
          return configWrite(api.updateBundle(name, update));
        },

        /** Deletes a bundle definition and drops its run state once the server confirms it. */
        deleteBundle(name: string): Observable<LingoTrackerConfigDto | null> {
          return configWrite(api.deleteBundle(name)).pipe(tap(() => controller.clear(name)));
        },

        /**
         * Starts generation of one bundle and polls the job until it completes or fails.
         * Ignored while the same bundle is already running.
         */
        generateBundle,

        /**
         * Re-runs a bundle after a failure (or any finished run).
         */
        retryBundle(name: string): void {
          generateBundle(name);
        },

        /**
         * Starts every configured bundle that is not running and records only those starts.
         * Jobs poll independently; an immediate request failure still counts as a started run.
         * Ignored while the current batch is still running.
         */
        generateAllBundles(): void {
          controller.startAll(
            store.bundleEntries().map(({ name }) => name),
            store.config()?.locales?.length ?? 0,
          );
        },

        /**
         * Removes the run state for a bundle (e.g. dismissing a result strip).
         */
        clearBundleRun(name: string): void {
          controller.clear(name);
        },

        /**
         * Restores runs mirrored to session storage and picks up any job that was still
         * in flight when the page reloaded.
         */
        restoreBundleRuns(): void {
          controller.restore();
        },
      };
    }),
    withHooks({
      onInit(store) {
        store.restoreBundleRuns();
      },
    }),
  );
}
