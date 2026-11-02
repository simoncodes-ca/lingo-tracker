import { signal } from '@angular/core';

import type { EditorFocus } from './editor-focus';

export interface EditorPanelsOptions {
  editorFocus: Pick<EditorFocus, 'request'>;
  /** False while the editor is view-only: the folder popover will not open. */
  canOpenFolderPopover: () => boolean;
  /** False while there is no locale besides the base: the drawer will not open. */
  canOpenLocalesDrawer: () => boolean;
}

/**
 * The translation editor's transient panels: the folder popover (with its staged
 * folder and filter), the other-locales drawer and the context disclosure. It
 * also owns the order in which Escape dismisses them and the focus intent that
 * follows an open or close. Editor Focus owns rendering and the DOM.
 */
export class EditorPanels {
  readonly #options: EditorPanelsOptions;

  readonly #isFolderPopoverOpen = signal(false);
  readonly #stagedFolderPath = signal<string | null>(null);
  readonly #folderFilter = signal('');
  readonly #isLocalesDrawerOpen = signal(false);
  readonly #isContextOpen = signal(false);

  /** The folder picker popover anchored to the location pill. */
  readonly isFolderPopoverOpen = this.#isFolderPopoverOpen.asReadonly();
  /** The folder staged inside the popover; only committed by `confirmStagedFolder`. */
  readonly stagedFolderPath = this.#stagedFolderPath.asReadonly();
  /** Filter text typed in the popover, matched against folder paths. */
  readonly folderFilter = this.#folderFilter.asReadonly();
  /** The other-locales drawer sliding over the context column. */
  readonly isLocalesDrawerOpen = this.#isLocalesDrawerOpen.asReadonly();
  /** The context disclosure shown in place of the column below 1100px. */
  readonly isContextOpen = this.#isContextOpen.asReadonly();

  constructor(options: EditorPanelsOptions) {
    this.#options = options;
  }

  toggleFolderPopover(): void {
    if (this.#isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return;
    }
    this.openFolderPopover();
  }

  openFolderPopover(): void {
    if (!this.#options.canOpenFolderPopover()) {
      return;
    }
    this.#stagedFolderPath.set(null);
    this.#folderFilter.set('');
    this.#isFolderPopoverOpen.set(true);
    this.#options.editorFocus.request('folder-filter');
  }

  /**
   * Confirm, Escape and a backdrop click all land here, so focus comes back to
   * the pill that opened the popover. The overlay's `(detach)` fires a second
   * time after we have already closed; the `wasOpen` check keeps that from
   * stealing focus from wherever it went next.
   */
  closeFolderPopover(restoreFocus = true): void {
    const wasOpen = this.#isFolderPopoverOpen();
    this.#isFolderPopoverOpen.set(false);
    this.#stagedFolderPath.set(null);
    if (wasOpen && restoreFocus) {
      this.#options.editorFocus.request('location-pill');
    }
  }

  stageFolder(folderPath: string): void {
    this.#stagedFolderPath.set(folderPath);
  }

  setFolderFilter(filter: string): void {
    this.#folderFilter.set(filter);
  }

  /** Closes the popover and returns the folder it had staged, if any, for the caller to commit. */
  confirmStagedFolder(): string | null {
    const staged = this.#stagedFolderPath();
    this.closeFolderPopover();
    return staged;
  }

  openLocalesDrawer(): void {
    if (!this.#options.canOpenLocalesDrawer()) {
      return;
    }
    this.#isLocalesDrawerOpen.set(true);
    this.#options.editorFocus.request('drawer-first-control');
  }

  /** Done, Escape and the back arrow all hand focus back to the row that opened it. */
  closeLocalesDrawer(restoreFocus = true): void {
    const wasOpen = this.#isLocalesDrawerOpen();
    this.#isLocalesDrawerOpen.set(false);
    if (wasOpen && restoreFocus) {
      this.#options.editorFocus.request('locales-row');
    }
  }

  toggleContext(): void {
    this.#isContextOpen.update((open) => !open);
  }

  /**
   * Escape's first job: close the nearest open panel, popover before drawer, and
   * restore focus to its opener. True when a panel consumed the dismissal, so the
   * caller must go no further.
   */
  dismissNearest(): boolean {
    if (this.#isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return true;
    }
    if (this.#isLocalesDrawerOpen()) {
      this.closeLocalesDrawer();
      return true;
    }
    return false;
  }

  /** Closes every covering panel without restoring focus, for a caller that has a better target. */
  closeAll(): void {
    this.closeFolderPopover(false);
    this.closeLocalesDrawer(false);
  }
}
