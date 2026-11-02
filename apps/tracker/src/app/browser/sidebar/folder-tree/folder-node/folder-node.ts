import { CdkDrag, type CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { isDescendantFolderPath } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { injectFeedback } from '../../../feedback';
import { BrowserStore } from '../../../store/browser.store';
import { folderDrop } from '../../../store/folder-drop';
import { navigateTree, SIDEBAR_NAVIGATION } from '../../../store/tree-navigation';
import type { DragData } from '../../../types/drag-data';
import { InlineFolderInput } from '../inline-folder-input/inline-folder-input';

/**
 * Recursive component for rendering folder tree nodes.
 *
 * Features:
 * - Displays folder icon and name
 * - Chevron toggles expansion independently of selection
 * - Recursively renders child folders while expanded
 * - Emits events for folder clicks and expansion requests
 */
@Component({
  selector: 'app-folder-node',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    TranslocoModule,
    InlineFolderInput,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
  ],
  templateUrl: './folder-node.html',
  styleUrl: './folder-node.scss',
})
export class FolderNode {
  readonly store = inject(BrowserStore);

  /** The folder data to render */
  folder = input.required<FolderNodeDto>();

  /** Currently selected folder path */
  selectedPath = input<string | null>(null);

  /** Whether nested resources mode is active */
  showNestedResources = input<boolean>(false);

  /** Paths of every folder currently expanded, shared by the whole tree */
  expandedPaths = input<ReadonlySet<string>>(new Set<string>());

  /** Whether the tree is disabled (transient: search/operation in progress). Blocks navigation too. */
  disabled = input<boolean>(false);

  /** Whether the collection is read-only. Blocks mutation (drag/drop/delete) but NOT navigation. */
  readOnly = input<boolean>(false);

  /** Emitted when a folder is clicked */
  folderClick = output<FolderNodeDto>();

  /** Emitted when the chevron is activated, flipping this folder open or shut */
  toggleExpanded = output<string>();

  /** Emitted when a folder should open without closing if already open */
  expandRequested = output<string>();

  /** Emitted when delete button is clicked or Delete key is pressed */
  deleteFolder = output<string>();

  /** Emitted when the inline input confirms a folder name. */
  createFolder = output<{ folderName: string; parentPath: string }>();

  /** Whether this folder is currently being deleted */
  isDeleting = input<boolean>(false);

  /** Emitted when a resource is dropped on this folder */
  resourceDropped = output<{ dragData: DragData; targetFolderPath: string }>();

  /** Emitted when a folder is dropped on this folder */
  folderDropped = output<{ dragData: DragData; targetFolderPath: string }>();

  /** Emitted when drag starts on this folder */
  dragStarted = output<DragData>();

  /** Emitted when drag ends on this folder */
  dragEnded = output<void>();

  /** Signal tracking the currently active drag item */
  activeDragData = input<DragData | null>(null);

  readonly TOKENS = TRACKER_TOKENS;

  /** Mutation affordances (drag, drop, delete) are disabled when the tree is busy OR read-only. */
  readonly mutationDisabled = computed(() => this.disabled() || this.readOnly());

  /** Child folders of this node, empty when the folder has none. */
  readonly childFolders = computed(() => this.folder().tree?.children ?? []);

  /** Only a folder with children gets a chevron; the rest get a spacer that keeps names aligned. */
  readonly hasChildren = computed(() => this.childFolders().length > 0);

  /** Whether this folder is currently expanded. */
  readonly isExpanded = computed(() => this.expandedPaths().has(this.folder().fullPath));

  /** Timer for auto-expand on hover */
  #expandTimer: ReturnType<typeof setTimeout> | null = null;

  /** Signal tracking if this folder is being hovered during drag */
  readonly isHoveredDuringDrag = signal(false);

  /** Signal exposing whether a folder is being added */
  readonly isAddingFolder = this.store.isAddingFolder;

  /** Signal exposing the parent path for the folder being added */
  readonly addFolderParentPath = this.store.addFolderParentPath;

  /** Signal exposing the path of the newly created folder */
  readonly newlyCreatedFolderPath = this.store.newlyCreatedFolderPath;

  readonly #feedback = injectFeedback();

  /** The refusal of the last create typed into this tree, as the store decided it. */
  readonly createError = computed(() => {
    const feedback = this.store.folderCreateError();
    return feedback ? this.#feedback.text(feedback) : null;
  });

  /** Whether the inline input should be shown for this folder */
  readonly shouldShowInlineInput = computed(() => {
    return this.isAddingFolder() && this.addFolderParentPath() === this.folder().fullPath;
  });

  /** Whether this folder was just created */
  readonly isNewlyCreated = computed(() => {
    return this.newlyCreatedFolderPath() === this.folder().fullPath;
  });

  /** Checks if this folder is a descendant of the selected folder */
  readonly isDescendantOfSelected = computed(() => {
    const selected = this.selectedPath();
    const myPath = this.folder().fullPath;
    if (!selected || !myPath) return false;
    return isDescendantFolderPath(selected, myPath);
  });

  /** Determines which icon to display for the folder */
  readonly folderIcon = computed(() => {
    if (this.isSelected()) return 'folder_check';
    if (this.showNestedResources() && this.isDescendantOfSelected()) {
      return 'folder_check';
    }
    return this.isExpanded() ? 'folder_open' : 'folder';
  });

  /**
   * Handles folder click: selects the folder and, if it was shut, opens it so a single
   * click still drills down. Clicking an already-open folder leaves it open — collapsing
   * is the chevron's job.
   */
  onFolderClick(): void {
    this.folderClick.emit(this.folder());

    if (this.hasChildren() && !this.isExpanded()) {
      this.expandRequested.emit(this.folder().fullPath);
    }
  }

  /**
   * Handles chevron activation. Stops propagation so opening a folder does not also
   * select it — the chevron is the one control that touches expansion alone.
   */
  onToggleExpandedClick(event: Event): void {
    event.stopPropagation();
    this.toggleExpanded.emit(this.folder().fullPath);
  }

  onTreeKeydown(event: Event, key: string): void {
    const next = navigateTree(
      {
        focusedPath: this.folder().fullPath,
        expanded: this.isExpanded(),
        hasChildren: this.hasChildren(),
        hasRows: true,
      },
      key,
      SIDEBAR_NAVIGATION,
    );
    if (next.preventDefault) event.preventDefault();
    const intent = next.intent;
    switch (intent.kind) {
      case 'expand':
        this.expandRequested.emit(intent.path);
        break;
      case 'collapse':
        this.toggleExpanded.emit(intent.path);
        break;
      case 'select':
        this.folderClick.emit(this.folder());
        if (intent.open) this.expandRequested.emit(intent.path);
        break;
      case 'focus':
      case 'none':
        break;
    }
  }

  /**
   * Checks if this folder is currently selected.
   */
  isSelected(): boolean {
    return this.folder().fullPath === this.selectedPath();
  }

  /**
   * Handles confirmation of folder name from inline input.
   * Calls the store to create the folder.
   */
  onFolderConfirm(folderName: string): void {
    this.createFolder.emit({ folderName, parentPath: this.folder().fullPath });
  }

  /**
   * Handles cancellation of folder creation from inline input.
   * Calls the store to reset the adding state.
   */
  onFolderCancel(): void {
    this.store.cancelAddingFolder();
  }

  /**
   * Handles delete button click.
   * Stops event propagation to prevent folder selection.
   */
  onDeleteClick(event: Event): void {
    event.stopPropagation();
    if (!this.disabled()) {
      this.deleteFolder.emit(this.folder().fullPath);
    }
  }

  /**
   * Handles Delete key press on folder header.
   * Stops event propagation to prevent unwanted side effects.
   */
  onDeleteKeydown(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.disabled()) {
      this.deleteFolder.emit(this.folder().fullPath);
    }
  }

  /**
   * Drag data for this folder.
   * Contains folder path and type identifier.
   */
  readonly dragData = computed<DragData>(() => ({
    type: 'folder',
    path: this.folder().fullPath,
  }));

  /**
   * Validates if the current drag operation is a valid drop target.
   * Returns true if this folder can accept the currently dragged item.
   */
  readonly isValidDropTarget = computed(() => {
    return folderDrop(this.activeDragData(), this.folder().fullPath, this.readOnly()).canLand;
  });

  /**
   * Handles drop events on this folder.
   * Determines if a resource or folder was dropped and emits appropriate event.
   */
  onDrop(event: CdkDragDrop<string>): void {
    this.isHoveredDuringDrag.set(false);

    const dragData = event.item.data as DragData;
    const targetFolderPath = this.folder().fullPath;

    if (!folderDrop(dragData, targetFolderPath, this.readOnly()).canLand) return;

    if (dragData.type === 'resource') {
      this.resourceDropped.emit({ dragData, targetFolderPath });
    } else if (dragData.type === 'folder') {
      this.folderDropped.emit({ dragData, targetFolderPath });
    }
  }

  /**
   * Handles drag started event.
   * Emits drag data to parent components for tracking.
   */
  onDragStarted(): void {
    this.dragStarted.emit(this.dragData());
  }

  /**
   * Handles drag ended event.
   * Notifies parent components that drag has ended.
   */
  onDragEnded(): void {
    this.dragEnded.emit();
  }

  /**
   * Handles drop list entered event.
   * Starts auto-expand timer and sets hover state.
   */
  onDropListEntered(): void {
    this.isHoveredDuringDrag.set(true);

    // Hovering a shut folder mid-drag opens it, so a drop can reach nested targets
    if (this.hasChildren() && !this.isExpanded() && this.isValidDropTarget()) {
      this.#expandTimer = setTimeout(() => {
        this.expandRequested.emit(this.folder().fullPath);
      }, 500);
    }
  }

  /**
   * Handles drop list exited event.
   * Cancels auto-expand timer and clears hover state.
   */
  onDropListExited(): void {
    this.isHoveredDuringDrag.set(false);

    // Clear the auto-expand timer if it exists
    if (this.#expandTimer) {
      clearTimeout(this.#expandTimer);
      this.#expandTimer = null;
    }
  }

  /**
   * Predicate function for CDK drop list to determine if drop is allowed.
   */
  canDrop = (drag: CdkDrag<DragData>): boolean => {
    return folderDrop(drag.data, this.folder().fullPath, this.readOnly()).canLand;
  };
}
