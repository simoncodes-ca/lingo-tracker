import { computed, type Signal, signal } from '@angular/core';
import type { FolderNodeDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { folderPathSegments } from '@simoncodes-ca/domain';
import { type Observable, Subscription } from 'rxjs';
import { createRestartableDelay } from '../../../shared/timed-transients';
import {
  absorbDottedKey,
  type ContextTreeNode,
  collisionFor,
  contextTree,
  folderEntryKeys,
  type KnownEntries,
  resolveDraftKey,
} from './resource-entry-draft';

/** The folder reads available to one editor without moving the browser list. */
export interface EditorLocationPeek {
  folderEntries: Signal<ReadonlyMap<string, readonly string[]>>;
  loadingFolders: Signal<ReadonlySet<string>>;
  peekFolder(collectionName: string, path: string): Observable<unknown>;
}

export interface EditorLocationOptions {
  collectionName: string;
  mode: 'create' | 'edit';
  original?: ResourceSummaryDto;
  rootFolders: Signal<FolderNodeDto[]>;
  browserFolderPath: Signal<string>;
  browserEntries: Signal<ResourceSummaryDto[]>;
  peek: EditorLocationPeek;
  absorbedLabel: (folderPath: string) => string;
  moreLabel: (hidden: number) => string;
}

/** Folder selection, dotted-key continuation, and the target folder's known entries. */
export class EditorLocation {
  readonly #absorbedFlash = signal(false);
  readonly absorbedFlash = this.#absorbedFlash.asReadonly();
  readonly #absorbedMessage = signal('');
  readonly absorbedMessage = this.#absorbedMessage.asReadonly();
  readonly #absorptionDelay = createRestartableDelay(900);
  #animationFrame = 0;
  #destroyed = false;
  readonly selectedFolderPath = signal('');
  readonly #key = signal('');
  #folderFromKey: string | null = null;
  readonly #reads = new Subscription();
  readonly #options: EditorLocationOptions;

  readonly #knownEntries = computed<KnownEntries>(() => ({
    rootFolders: this.#options.rootFolders(),
    browserFolderPath: this.#options.browserFolderPath(),
    browserEntries: this.#options.browserEntries(),
    fetched: this.#options.peek.folderEntries(),
  }));

  readonly keyCollision = computed(() =>
    collisionFor(this.#key(), this.selectedFolderPath(), this.#knownEntries(), this.#ownKey()),
  );

  readonly fullKeyPreview = computed(() => {
    const folder = this.selectedFolderPath();
    const key = this.#key();
    return key.trim() ? resolveDraftKey({ key, folderPath: folder }) : folder;
  });

  readonly contextTree = computed<ContextTreeNode[]>(() =>
    contextTree(
      {
        folderPath: this.selectedFolderPath(),
        key: this.#key(),
        known: this.#knownEntries(),
        loadingFolders: this.#options.peek.loadingFolders(),
        ownKey: this.#ownKey(),
      },
      this.#options.moreLabel,
    ),
  );

  readonly folderSegments = computed(() => folderPathSegments(this.selectedFolderPath()));
  constructor(options: EditorLocationOptions) {
    this.#options = options;
  }

  /** Returns the absorbed leaf and folder, if the key contained a valid dotted prefix. */
  typeKey(raw: string): { leaf: string; folder?: string } | null {
    const absorbed =
      this.#options.mode === 'create' ? absorbDottedKey(raw, this.selectedFolderPath(), this.#folderFromKey) : null;
    this.#key.set(absorbed?.leaf ?? raw);
    if (absorbed?.folder !== undefined) {
      this.#folderFromKey = absorbed.folder;
      this.#select(absorbed.folder);
      this.#announceAbsorbed(absorbed.folder);
    }
    return absorbed;
  }

  pick(folderPath: string): void {
    this.#folderFromKey = null;
    this.#select(folderPath);
  }

  destroy(): void {
    this.#destroyed = true;
    cancelAnimationFrame(this.#animationFrame);
    this.#absorptionDelay.destroy();
    this.#reads.unsubscribe();
  }

  /**
   * The prefix leaves the field the user is looking at and lands in a pill above
   * it, so say so twice: a highlight for the eye, a live region for the reader.
   */
  #announceAbsorbed(folderPath: string): void {
    this.#absorbedMessage.set(this.#options.absorbedLabel(folderPath));

    this.#absorbedFlash.set(false);
    // Let the class drop for a frame so a second paste re-runs the animation.
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = requestAnimationFrame(() => {
      if (!this.#destroyed) this.#absorbedFlash.set(true);
    });
    this.#absorptionDelay.schedule(() => this.#absorbedFlash.set(false));
  }

  #ownKey(): string | undefined {
    return this.#options.mode === 'edit' && this.#options.original?.folderPath === this.selectedFolderPath()
      ? this.#options.original.entryKey
      : undefined;
  }

  #select(folderPath: string): void {
    this.selectedFolderPath.set(folderPath);
    if (folderEntryKeys(folderPath, this.#knownEntries()) || this.#options.peek.loadingFolders().has(folderPath)) {
      return;
    }
    this.#reads.add(
      this.#options.peek.peekFolder(this.#options.collectionName, folderPath).subscribe({
        // An unreadable folder claims nothing. The save path still guards.
        error: () => undefined,
      }),
    );
  }
}
