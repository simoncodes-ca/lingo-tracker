import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { splitResolvedKey } from '@simoncodes-ca/domain';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { NotificationService } from '../../shared/notification';
import { injectRestartableDelay } from '../../shared/timed-transients';
import {
  type EditorOutcome,
  TRANSLATION_EDITOR_TITLE_ID,
  TranslationEditorDialog,
  type TranslationEditorDialogData,
} from '../dialogs/translation-editor';
import { BrowserStore } from '../store/browser.store';
import { captureSession, withinSession } from '../store/session-guard';
import { FolderPeek } from './folder-peek';
import { resourceMovedToast } from './resource-moved-toast';

/** A create's skipped-locales warning waits out the success toast, so the two do not overlap. */
export const CREATE_WARNING_DELAY_MS = 3200;

/**
 * Opens the translation editor, for a create or an edit, and gives the feedback for how it closed.
 *
 * The header's "add" button, the list's rows and the "Open existing" hand-off all open the same
 * dialog. The launcher is the one place that knows its configuration and reads its
 * {@link EditorOutcome}: the toasts, and the hand-off to the entry the user collided with. The
 * store has already brought the list in line before the dialog closes (see
 * `with-entry-writes.feature.ts`), so there is nothing left to reload here.
 *
 * Each method resolves with the outcome once the feedback is given, for a caller that has its
 * own reaction (the list flashes a saved row). An "Open existing" hand-off resolves with the
 * outcome of the edit it hands over to, so a caller never sees `open-existing`.
 */
@Injectable({ providedIn: 'root' })
export class TranslationEditorLauncher {
  readonly #dialog = inject(MatDialog);
  readonly #folderPeek = inject(FolderPeek);
  readonly #browserStore = inject(BrowserStore);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #scheduleCreateWarning = injectRestartableDelay(CREATE_WARNING_DELAY_MS);

  /** Opens the editor to create an entry in the folder the list shows. */
  openCreate(): Promise<EditorOutcome> {
    return this.#open({ mode: 'create', folderPath: this.#browserStore.currentFolderPath() });
  }

  /** Opens the editor for a resource the caller already holds. */
  openEdit(resource: ResourceSummaryDto): Promise<EditorOutcome> {
    return this.#open({ mode: 'edit', resource, folderPath: resource.folderPath });
  }

  /**
   * Opens the editor for a full dot-delimited key, from a caller that has nothing but the key:
   * the "Open existing" hand-off, with the key of the entry the user collided with.
   *
   * The list is moved to the entry's folder first (leaving a search), so the dialog closes onto
   * the list the entry is actually in rather than back onto an unrelated folder.
   */
  async openByFullKey(fullKey: string): Promise<EditorOutcome> {
    const collectionName = this.#browserStore.selectedCollection();
    if (!collectionName) return { kind: 'cancelled' };
    const folderPath = splitResolvedKey(fullKey).folderPath.join('.');

    // A lookup, not a list load: the List Scope loads the rows once the entry is known to exist.
    // It is session-guarded: `null` means another collection opened meanwhile, so that one gets
    // neither the folder nor the editor. `undefined` means the lookup failed or found no entry.
    const resource = await firstValueFrom(
      this.#folderPeek
        .openFolderPeek()
        .peekFolder(collectionName, folderPath)
        .pipe(
          withinSession(captureSession(this.#browserStore)),
          map((tree) => tree.resources.find((item) => item.fullKey === fullKey)),
          catchError(() => of(undefined)),
        ),
      { defaultValue: null },
    );
    if (resource === null) return { kind: 'cancelled' };
    if (!resource) {
      this.#notifications.error(this.#transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.NOTFOUND));
      return { kind: 'cancelled' };
    }

    this.#browserStore.showFolder(folderPath);
    return this.openEdit(resource);
  }

  async #open(data: Pick<TranslationEditorDialogData, 'mode' | 'resource' | 'folderPath'>): Promise<EditorOutcome> {
    const collectionName = this.#browserStore.selectedCollection();
    if (!collectionName) return { kind: 'cancelled' };

    const dialogData: TranslationEditorDialogData = {
      ...data,
      collectionName,
      availableLocales: this.#browserStore.availableLocales(),
      baseLocale: this.#browserStore.baseLocale(),
      readOnly: this.#browserStore.isReadOnly(),
    };

    const dialogRef = this.#dialog.open<TranslationEditorDialog, TranslationEditorDialogData, EditorOutcome>(
      TranslationEditorDialog,
      {
        // Size, max-height and the small-viewport full-screen mode live in
        // `.translation-editor-dialog-panel` (styles.scss). `maxWidth` is overridden
        // only to lift the CDK's inline 80vw default, which would otherwise beat the
        // stylesheet.
        panelClass: 'translation-editor-dialog-panel',
        maxWidth: '100vw',
        data: dialogData,
        autoFocus: false,
        ariaLabelledBy: TRANSLATION_EDITOR_TITLE_ID,
        // An edit hands focus back to the list's own keyboard handling, not to the opener.
        restoreFocus: data.mode === 'create',
      },
    );

    // Closing without a result (a backdrop click) is a cancel too.
    const outcome = (await firstValueFrom(dialogRef.afterClosed(), { defaultValue: undefined })) ?? {
      kind: 'cancelled',
    };
    return this.#followUp(outcome);
  }

  /** The feedback for one outcome. An "Open existing" hand-off resolves with the outcome of the edit it opens. */
  async #followUp(outcome: EditorOutcome): Promise<EditorOutcome> {
    const toast = TRACKER_TOKENS.BROWSER.TOAST;
    switch (outcome.kind) {
      case 'saved':
        this.#notifications.success(this.#transloco.translate(toast.TRANSLATIONUPDATED));
        this.#warnSkipped(outcome.skippedLocales);
        return outcome;
      case 'moved':
        this.#notifications.success(
          resourceMovedToast(this.#transloco, splitResolvedKey(outcome.fullKey).entryKey, outcome.folderPath),
        );
        this.#warnSkipped(outcome.skippedLocales);
        return outcome;
      case 'created':
        this.#notifications.success(this.#transloco.translate(toast.RESOURCECREATED));
        this.#warnSkippedAfterCreate(outcome.skippedLocales);
        return outcome;
      case 'open-existing':
        // A hand-off, not a save: the create closes and the editor opens on the entry the user meant.
        return this.openByFullKey(outcome.fullKey);
      case 'cancelled':
        return outcome;
    }
  }

  #warnSkipped(skippedLocales: string[]): void {
    if (skippedLocales.length === 0) return;
    this.#notifications.warning(
      this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, { locales: skippedLocales.join(', ') }),
    );
  }

  #warnSkippedAfterCreate(skippedLocales: string[]): void {
    if (skippedLocales.length === 0) return;
    const locales = skippedLocales.join(', ');
    this.#scheduleCreateWarning(() => {
      this.#notifications.warning(
        this.#transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.AUTOTRANSLATIONSKIPPEDX, { locales }),
      );
    });
  }
}
