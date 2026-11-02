import type { Signal } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { collectExpandablePaths } from '../folder-tree.utils';
import { expandTreePath } from '../tree-navigation';

/** User intent from the folder tree. Programmatic navigation stays in the List Scope. */
export function withFolderTreeInteractionsFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        expandedFolders: ReadonlySet<string>;
        preFilterExpandedFolders: ReadonlySet<string> | null;
        isRootExpanded: boolean;
        folderTreeFilter: string;
      }>(),
      props: type<{
        isDisabled: Signal<boolean>;
        filteredFolders: Signal<FolderNodeDto[]>;
        areAllFoldersExpanded: Signal<boolean>;
      }>(),
      methods: type<{ showFolder(path: string): void }>(),
    },
    withMethods((store) => ({
      /** Returns whether the row selection was accepted, for the sidebar's selection output. */
      selectFolder(path: string): boolean {
        if (store.isDisabled()) return false;
        store.showFolder(path);
        return true;
      },

      /**
       * Applies the folder filter and takes expansion with it: a filter that hid its own
       * matches inside collapsed parents would be useless, so matching branches open
       * automatically. The pre-filter expansion is stashed and restored on clear, which
       * keeps chevrons working normally while a filter is active. Pending debounced edits
       * still apply while disabled; the template prevents new edits during that time.
       */
      setFolderTreeFilter(filter: string): void {
        const wasFiltering = store.folderTreeFilter().trim().length > 0;
        const isFiltering = filter.trim().length > 0;

        if (isFiltering) {
          patchState(store, {
            folderTreeFilter: filter,
            preFilterExpandedFolders: wasFiltering ? store.preFilterExpandedFolders() : store.expandedFolders(),
          });
          patchState(store, { expandedFolders: new Set(collectExpandablePaths(store.filteredFolders())) });
          return;
        }

        patchState(store, {
          folderTreeFilter: filter,
          expandedFolders: store.preFilterExpandedFolders() ?? store.expandedFolders(),
          preFilterExpandedFolders: null,
        });
      },

      toggleFolderExpanded(path: string): void {
        if (store.isDisabled()) return;
        patchState(store, { expandedFolders: expandTreePath(store.expandedFolders(), path) });
      },

      /** Opens a folder without closing it if it is already open — used when selecting a row. */
      expandFolder(path: string): void {
        if (store.isDisabled()) return;
        if (!path || store.expandedFolders().has(path)) return;
        patchState(store, { expandedFolders: expandTreePath(store.expandedFolders(), path, true) });
      },

      /** Returns whether the root changed, so no-op keydowns keep their default behavior. */
      setRootExpanded(open = !store.isRootExpanded()): boolean {
        if (store.isDisabled() || open === store.isRootExpanded()) return false;
        patchState(store, { isRootExpanded: open });
        return true;
      },

      /**
       * Opens every folder in view. Scoped to the filtered subtree when a filter is active,
       * so it never expands branches the user has just filtered away.
       */
      expandAllFolders(): void {
        if (store.isDisabled()) return;
        const expanded = new Set(store.expandedFolders());
        for (const path of collectExpandablePaths(store.filteredFolders())) expanded.add(path);
        patchState(store, { expandedFolders: expanded, isRootExpanded: true });
      },

      /** Closes every folder but leaves the root open, so the top level stays reachable. */
      collapseAllFolders(): void {
        if (store.isDisabled()) return;
        patchState(store, { expandedFolders: new Set<string>(), isRootExpanded: true });
      },
    })),
    withMethods((store) => ({
      /** The root row's expand/collapse-all control. */
      toggleAllFoldersExpanded(): void {
        if (store.areAllFoldersExpanded()) store.collapseAllFolders();
        else store.expandAllFolders();
      },
    })),
  );
}
