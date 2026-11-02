import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type {
  LingoTrackerConfigDto,
  ResourceSummaryDto,
  SearchResultDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { isNeedsWorkStatus } from '@simoncodes-ca/domain';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { CollectionsStore } from '../../../collections/store/collections.store';
import { provideTrackerHttpClient } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import { PREFERRED_TERM_DEBOUNCE_MS } from './editor-advisories';
import type { TranslationEditorDialogData } from './editor-session';
import type { EditorOutcome } from './editor-submit';
import { TRANSLATION_EDITOR_TITLE_ID, TranslationEditorDialog } from './translation-editor-dialog';

describe('TranslationEditorDialog', () => {
  let component: TranslationEditorDialog;
  let fixture: ComponentFixture<TranslationEditorDialog>;
  let spectator: Spectator<TranslationEditorDialog>;
  let dialogRef: {
    close: Mock;
    afterOpened: Mock;
    keydownEvents: Mock;
    backdropClick: Mock;
    disableClose: boolean;
  };
  let mockDialog: { open: Mock };
  let apiSpies: {
    createResource: Mock;
    updateResource: Mock;
    searchTranslations: Mock;
    getResourceTree: Mock;
  };
  let mockNotifications: { success: Mock; info: Mock; warning: Mock; error: Mock };
  let mockConfig: WritableSignal<LingoTrackerConfigDto | null>;

  const summary = (
    fullKey: string,
    baseValue: string,
    targets: Record<string, [string | undefined, TranslationStatus | undefined]> = {},
    extra: Partial<ResourceSummaryDto> = {},
  ): ResourceSummaryDto => {
    const segments = fullKey.split('.');
    const entryKey = segments.pop() ?? '';
    return {
      fullKey,
      folderPath: segments.join('.'),
      entryKey,
      base: { locale: 'en', value: baseValue },
      targets: Object.entries(targets).map(([locale, [value, status]]) => ({
        locale,
        value,
        status,
        needsWork: status === undefined || isNeedsWorkStatus(status),
        sameAsBase: (value?.trim() ?? '').length > 0 && value?.trim() === baseValue.trim(),
      })),
      tags: [],
      inheritedTags: [],
      ...extra,
    };
  };

  /** The outcome the dialog closed with. */
  const closedWith = (): EditorOutcome | undefined => dialogRef.close.mock.calls.at(-1)?.[0];

  const createMockData = (mode: 'create' | 'edit', resource?: ResourceSummaryDto): TranslationEditorDialogData => ({
    mode,
    resource,
    collectionName: 'test-collection',
    folderPath: 'common.buttons',
    availableLocales: ['en', 'fr', 'de'],
    baseLocale: 'en',
  });

  const dialogData = createMockData('create');

  describe('Tag input', () => {
    it('should reset the typed-text signal on Enter even when the text is blank', () => {
      spectator.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input.chip-add-input');
      expect(input).not.toBeNull();
      if (!input) return;

      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      expect(component.session.tagInputText()).toBe('   ');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

      expect(component.session.tagInputText()).toBe('');
      expect(input.value).toBe('');
      expect(component.session.entry.tags()).toEqual([]);
    });
  });

  const flushFocus = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const createDialog = createComponentFactory({
    component: TranslationEditorDialog,
    imports: [getTranslocoTestingModule()],
    providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
    componentProviders: [
      { provide: MatDialogRef, useFactory: () => dialogRef },
      { provide: MatDialog, useFactory: () => mockDialog },
      { provide: NotificationService, useFactory: () => mockNotifications },
      { provide: CollectionsStore, useFactory: () => ({ config: mockConfig }) },
      { provide: MAT_DIALOG_DATA, useValue: dialogData },
    ],
    detectChanges: false,
  });

  const renderDialog = (data: TranslationEditorDialogData): void => {
    dialogData.resource = undefined;
    dialogData.folderPath = undefined;
    dialogData.readOnly = undefined;
    Object.assign(dialogData, data);
    spectator = createDialog();
    fixture = spectator.fixture;
    component = spectator.component;
    spectator.detectChanges();
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
      afterOpened: vi.fn().mockReturnValue(of(undefined)),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
      disableClose: false,
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };

    // The dialog uses the real SimilarValues and FolderPeek services; the API client is spied at its boundary.
    apiSpies = {
      createResource: vi.spyOn(BrowserApiService.prototype, 'createResource') as Mock,
      updateResource: vi.spyOn(BrowserApiService.prototype, 'updateResource') as Mock,
      searchTranslations: vi.spyOn(BrowserApiService.prototype, 'searchTranslations') as Mock,
      getResourceTree: vi.spyOn(BrowserApiService.prototype, 'getResourceTree') as Mock,
    };
    apiSpies.createResource.mockReturnValue(of({}));
    apiSpies.updateResource.mockReturnValue(of({}));
    apiSpies.searchTranslations.mockReturnValue(of({ results: [], total: 0 }));
    apiSpies.getResourceTree.mockReturnValue(of({ path: '', resources: [], children: [] }));

    mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    mockConfig = signal<LingoTrackerConfigDto | null>(null);

    renderDialog(createMockData('create'));
  });

  afterEach(() => vi.restoreAllMocks());

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render the heading the dialog container is labelled by', () => {
      const heading = spectator.query(`#${TRANSLATION_EDITOR_TITLE_ID}`);

      expect(heading).toBeTruthy();
      expect(heading?.tagName).toBe('H2');
      expect(heading?.textContent?.trim()).toBeTruthy();
    });

    it('should display create mode title and subtitle', () => {
      expect(component.presentation.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE);
      expect(component.presentation.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLEX);
    });

    it('should display edit mode title and subtitle', async () => {
      const editData = createMockData('edit', summary('common.buttons.test_key', 'Test Value'));
      renderDialog(editData);

      expect(component.presentation.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE);
      expect(component.presentation.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX);
    });
  });

  describe('Auto-translate is not offered from the editor', () => {
    it('should expose no auto-translate entry point on the component', () => {
      const surface = component as unknown as Record<string, unknown>;
      expect(surface['onAutoTranslate']).toBeUndefined();
      expect(surface['canAutoTranslate']).toBeUndefined();
      expect(surface['isAutoTranslating']).toBeUndefined();
    });

    it('should render no auto-translate control on the Other Locales tab', () => {
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.auto-translate-button')).toBeNull();
      expect(host.querySelector('.locales-toolbar')).toBeNull();
    });
  });

  describe('Dialog Interaction', () => {
    it('should take ownership of Escape so stacked dialogs cannot close the editor', () => {
      expect(dialogRef.disableClose).toBe(true);
      expect(dialogRef.keydownEvents).toHaveBeenCalled();
      expect(dialogRef.backdropClick).toHaveBeenCalled();
    });

    it('routes Escape and backdrop clicks to the session and prevents Escape default', async () => {
      const keys = new Subject<KeyboardEvent>();
      const backdrop = new Subject<MouseEvent>();
      dialogRef.keydownEvents.mockReturnValue(keys);
      dialogRef.backdropClick.mockReturnValue(backdrop);
      renderDialog(createMockData('create'));
      const cancel = vi.spyOn(component.session, 'onCancel').mockResolvedValue(undefined);
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      const preventDefault = vi.spyOn(escapeEvent, 'preventDefault');

      keys.next(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(cancel).not.toHaveBeenCalled();
      keys.next(escapeEvent);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(escapeEvent.defaultPrevented).toBe(true);
      expect(cancel).toHaveBeenCalledTimes(1);

      backdrop.next(new MouseEvent('click'));
      expect(cancel).toHaveBeenCalledTimes(2);
      fixture.destroy();
      keys.next(escapeEvent);
      backdrop.next(new MouseEvent('click'));
      expect(cancel).toHaveBeenCalledTimes(2);
    });

    it('should trigger save on Ctrl+Enter', async () => {
      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });
      vi.spyOn(event, 'preventDefault');

      await component.onCtrlEnter(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('should trigger save on Cmd+Enter', async () => {
      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
      });
      vi.spyOn(event, 'preventDefault');

      await component.onCtrlEnter(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    // Absorption leaves malformed dotted input intact; segmentValidator blocks creation.
    it.each(['apps..common.ok', '.ok', '.'])('rejects unabsorbed malformed dotted input %j', async (key) => {
      renderDialog(createMockData('create'));
      component.session.entry.form.controls.baseValue.setValue('OK');
      component.session.entry.form.controls.key.setValue(key);
      await component.session.onSubmit();
      spectator.detectChanges();

      expect(component.session.entry.form.controls.key.value).toBe(key);
      expect(component.session.entry.form.controls.key.hasError('pattern')).toBe(true);
      expect(component.presentation.getKeyErrorMessage()).toBe(
        TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR,
      );
      expect(spectator.query('#translation-editor-key-error')?.textContent?.trim()).toBeTruthy();
      expect(apiSpies.createResource).not.toHaveBeenCalled();
    });

    it('should not submit invalid form on Ctrl+Enter', async () => {
      component.session.entry.form.controls.key.setValue('');
      component.session.entry.form.controls.baseValue.setValue('');

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });

      await component.onCtrlEnter(event);
      spectator.detectChanges();

      expect(dialogRef.close).not.toHaveBeenCalled();
      await flushFocus();
      expect(document.activeElement).toBe(spectator.query('#translation-editor-key'));
    });
  });

  describe('Comment Confirmation Flow', () => {
    it('should ignore Ctrl+Enter while the comment confirmation is open', async () => {
      const answer = new Subject<boolean>();
      mockDialog.open.mockReturnValue({ afterClosed: () => answer.asObservable() });
      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.form.controls.comment.setValue('');

      const first = component.session.onSubmit();
      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalledTimes(1));
      const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
      await component.onCtrlEnter(event);

      expect(apiSpies.createResource).not.toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      answer.next(true);
      answer.complete();
      await first;
      expect(apiSpies.createResource).toHaveBeenCalledTimes(1);
    });

    it('should focus the comment field when user clicks "Add Comment"', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.form.controls.comment.setValue('');

      await component.session.onSubmit();
      // Editor Focus waits for render and the closing confirmation's queued focus restoration.
      spectator.detectChanges();

      const commentField = spectator.query('#translation-editor-comment');
      expect(commentField).toBeTruthy();
      await flushFocus();
      expect(document.activeElement).toBe(commentField);
    });

    it('should focus the comment field in edit mode when user clicks "Add Comment"', async () => {
      renderDialog(
        createMockData('edit', summary('common.buttons.test_key', 'Test Value', {}, { comment: 'Existing comment' })),
      );
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.session.entry.form.controls.comment.setValue('');

      await component.session.onSubmit();
      spectator.detectChanges();

      const commentField = spectator.query('#translation-editor-comment');
      expect(commentField).toBeTruthy();
      await flushFocus();
      expect(document.activeElement).toBe(commentField);
    });

    it('should select any existing comment text when the field is focused', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.form.controls.comment.setValue('   ');
      spectator.detectChanges();

      await component.session.onSubmit();
      spectator.detectChanges();

      const commentField = spectator.query<HTMLTextAreaElement>('#translation-editor-comment');
      await flushFocus();
      expect(commentField?.selectionStart).toBe(0);
      expect(commentField?.selectionEnd).toBe(3);
    });
  });

  describe('Location popover', () => {
    it('should stay closed until the location pill is used', () => {
      expect(component.session.panels.isFolderPopoverOpen()).toBe(false);
      expect(document.querySelector('.pop')).toBeNull();
    });

    it('should open the popover from the location pill', () => {
      spectator.click('[data-testid="location-pill"]');
      spectator.detectChanges();

      expect(component.session.panels.isFolderPopoverOpen()).toBe(true);
      expect(document.querySelector('.pop')).not.toBeNull();
    });

    it('should toggle the popover shut on a second click of the pill', () => {
      spectator.click('[data-testid="location-pill"]');
      spectator.click('[data-testid="location-pill"]');
      spectator.detectChanges();

      expect(component.session.panels.isFolderPopoverOpen()).toBe(false);
      expect(document.querySelector('.pop')).toBeNull();
    });
  });

  describe('Other locales drawer', () => {
    it('should stay closed until the Other locales row is used', () => {
      expect(component.session.panels.isLocalesDrawerOpen()).toBe(false);
      expect(spectator.query('[data-testid="locales-drawer"]')).toBeNull();
    });

    it('should open the drawer from the Other locales row', () => {
      spectator.click('[data-testid="other-locales-row"]');
      spectator.detectChanges();

      expect(component.session.panels.isLocalesDrawerOpen()).toBe(true);
      expect(spectator.query('[data-testid="locales-drawer"]')).not.toBeNull();
    });

    it('should close the drawer from Done', () => {
      component.session.panels.openLocalesDrawer();
      spectator.detectChanges();

      spectator.click('[data-testid="drawer-done"]');
      spectator.detectChanges();

      expect(component.session.panels.isLocalesDrawerOpen()).toBe(false);
      expect(spectator.query('[data-testid="locales-drawer"]')).toBeNull();
    });

    it('should advise on an unrenderable translation under plain transloco, for that locale only', () => {
      const select = '{name, select, other {Hello}}';
      mockConfig.set({
        baseLocale: 'en',
        locales: ['en', 'fr', 'de'],
        collections: {},
        runtime: 'transloco',
      } as LingoTrackerConfigDto);
      component.session.panels.openLocalesDrawer();
      component.session.entry.getLocaleFormGroup(1).controls.value.setValue(select);
      spectator.detectChanges();

      const advisories = spectator.queryAll<HTMLElement>('[data-testid="locale-runtime-advisory"]');
      expect(advisories).toHaveLength(1);
      expect(advisories[0].id).toBe('translation-editor-locale-runtime-advisory-1');
      expect(advisories[0].getAttribute('role')).toBe('status');
      const rows = spectator.queryAll<HTMLTextAreaElement>('[data-testid="locales-drawer"] textarea');
      expect(rows[0].getAttribute('aria-describedby')).toBeNull();
      expect(rows[1].getAttribute('aria-describedby')).toBe('translation-editor-locale-runtime-advisory-1');

      mockConfig.set({ baseLocale: 'en', locales: ['en', 'fr', 'de'], collections: {} } as LingoTrackerConfigDto);
      spectator.detectChanges();
      expect(spectator.query('[data-testid="locale-runtime-advisory"]')).toBeNull();
    });

    it('should describe the base value by the runtime advisory while it shows', () => {
      mockConfig.set({
        baseLocale: 'en',
        locales: ['en', 'fr', 'de'],
        collections: {},
        runtime: 'transloco',
      } as LingoTrackerConfigDto);
      renderDialog(createMockData('edit', summary('common.buttons.count', '{n, plural, other {#}}')));
      const base = spectator.query<HTMLTextAreaElement>('#translation-editor-base-value');
      expect(base?.getAttribute('aria-describedby')).toContain('translation-editor-runtime-advisory');
      expect(spectator.query('#translation-editor-runtime-advisory')?.getAttribute('role')).toBe('status');
    });

    it('should show the braced-placeholder error for the base value and a translation row', () => {
      component.session.panels.openLocalesDrawer();
      component.session.entry.form.controls.baseValue.markAsTouched();
      component.session.entry.form.controls.baseValue.setValue('Hi {{{who}}}');
      const row = component.session.entry.getLocaleFormGroup(0).controls.value;
      row.markAsTouched();
      row.setValue('Salut {{{who}}}');
      spectator.detectChanges();

      const base = spectator.query('#translation-editor-base-value-error');
      const rowError = spectator.query('#translation-editor-locale-error-0');
      expect(base?.querySelector('code')?.textContent).toBe('{{who}}');
      expect(rowError?.querySelector('code')?.textContent).toBe('{{who}}');
      expect(spectator.query('[data-testid="locales-drawer"] textarea')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('should open the drawer and focus the braced translation row when a submit fails on it', async () => {
      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.getLocaleFormGroup(0).controls.value.setValue('Salut {{{who}}}');

      await component.session.onSubmit();
      spectator.detectChanges();

      const row = spectator.query<HTMLTextAreaElement>('[data-testid="locales-drawer"] textarea');
      expect(component.session.panels.isLocalesDrawerOpen()).toBe(true);
      expect(spectator.query('#translation-editor-locale-error-0')?.querySelector('code')?.textContent).toBe('{{who}}');
      await flushFocus();
      expect(document.activeElement).toBe(row);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should focus a later invalid locale after Ctrl+Enter instead of the first drawer control', async () => {
      component.session.entry.form.controls.key.setValue('test_key');
      component.session.entry.form.controls.baseValue.setValue('Test Value');
      component.session.entry.getLocaleFormGroup(1).controls.value.setValue('Hallo {{{who}}}');
      component.session.panels.openFolderPopover();
      spectator.detectChanges();

      await component.onCtrlEnter(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
      spectator.detectChanges();

      const rows = spectator.queryAll<HTMLTextAreaElement>('[data-testid="locales-drawer"] textarea');
      expect(rows).toHaveLength(2);
      expect(component.session.panels.isFolderPopoverOpen()).toBe(false);
      expect(component.session.panels.isLocalesDrawerOpen()).toBe(true);
      await flushFocus();
      expect(document.activeElement).toBe(rows[1]);
      expect(apiSpies.createResource).not.toHaveBeenCalled();
    });

    it('should edit the same FormArray the save path reads', () => {
      component.session.panels.openLocalesDrawer();
      spectator.detectChanges();

      component.session.setLocaleStatus(0, 'verified');

      expect(component.session.entry.form.controls.translations.at(0).value.status).toBe('verified');
    });
  });

  describe('Context column', () => {
    it('should split the folder path for the location pill', () => {
      expect(component.session.location.folderSegments()).toEqual(['common', 'buttons']);
    });

    it('should highlight the row of the entry being created, not just pill it', () => {
      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
    });

    it('should highlight the row of the entry being edited', () => {
      renderDialog(createMockData('edit', summary('common.buttons.ok', 'OK')));
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
      expect(rows[0]).not.toHaveClass('ftree-n--taken');
    });

    it('should not repeat the full key, which the footer already carries', () => {
      expect(spectator.query('[data-testid="context-full-key"]')).toBeNull();
      expect(spectator.query('[data-testid="footer-key"]')).not.toBeNull();
    });

    it('should summarise only the folder and the similar count', () => {
      expect(component.presentation.contextSummary()).toBe('common.buttons');
    });

    it('should list only the locales that are new or stale', () => {
      renderDialog(
        createMockData(
          'edit',
          summary('common.buttons.ok', 'OK', {
            fr: ['Oui', 'stale'],
            de: ['Ja', 'verified'],
          }),
        ),
      );

      expect(component.session.entry.localesNeedingWork().map((locale) => locale.locale)).toEqual(['fr']);
      const rows = spectator.queryAll('[data-testid="locale-summary"] .lsum-r');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('fr');
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).toBeNull();
    });

    it('should show the caught-up line instead of an empty list', () => {
      renderDialog(
        createMockData(
          'edit',
          summary('common.buttons.ok', 'OK', {
            fr: ['Oui', 'translated'],
            de: ['Ja', 'verified'],
          }),
        ),
      );

      expect(component.session.entry.localesNeedingWork()).toHaveLength(0);
      expect(spectator.queryAll('[data-testid="locale-summary"] .lsum-r')).toHaveLength(0);
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).not.toBeNull();
    });
  });

  describe('Key collision', () => {
    const entry = (fullKey: string): ResourceSummaryDto => summary(fullKey, fullKey.split('.').at(-1) ?? fullKey);

    /** Puts entries in the folder the browser is showing, the cheapest source. */
    const seedBrowserFolder = (folderPath: string, keys: string[]): void => {
      const store = spectator.inject(BrowserStore);
      patchState(unprotected(store), {
        currentFolderPath: folderPath,
        translations: keys.map((key) => entry(folderPath ? `${folderPath}.${key}` : key)),
      });
    };

    it('should detect a collision against the entries the browser already holds', () => {
      seedBrowserFolder('common.buttons', ['ok', 'cancel']);

      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(component.session.location.keyCollision()).toBe(true);
      expect(spectator.query('[data-testid="key-collision-error"]')).not.toBeNull();
    });

    it('should detect a collision in a folder chosen from the popover', () => {
      apiSpies.getResourceTree.mockImplementation((_collection: string, path: string) =>
        of({ path, resources: path === 'common.errors' ? [entry('notFound')] : [], children: [] }),
      );

      component.session.entry.form.controls.key.setValue('notFound');
      spectator.detectChanges();
      expect(component.session.location.keyCollision()).toBe(false);

      component.session.panels.openFolderPopover();
      component.session.panels.stageFolder('common.errors');
      component.session.confirmStagedFolder();
      spectator.detectChanges();

      expect(apiSpies.getResourceTree).toHaveBeenCalledWith('test-collection', 'common.errors', false);
      expect(component.session.location.keyCollision()).toBe(true);
    });

    it('should detect a collision when an edit picks a folder holding its key', () => {
      apiSpies.getResourceTree.mockImplementation((_collection: string, path: string) =>
        of({ path, resources: path === 'common.errors' ? [entry('common.errors.save')] : [], children: [] }),
      );
      renderDialog(createMockData('edit', entry('common.buttons.save')));

      component.session.panels.openFolderPopover();
      component.session.panels.stageFolder('common.errors');
      component.session.confirmStagedFolder();
      spectator.detectChanges();

      expect(apiSpies.getResourceTree).toHaveBeenCalledWith('test-collection', 'common.errors', false);
      expect(component.session.location.keyCollision()).toBe(true);
      expect(spectator.query('[data-testid="key-collision-error"]')).not.toBeNull();
    });

    it('should not re-fetch a folder it has already loaded', () => {
      component.session.onFolderConfirmed('common.errors');
      component.session.onFolderConfirmed('common.buttons');
      component.session.onFolderConfirmed('common.errors');

      const errorFolderLoads = apiSpies.getResourceTree.mock.calls.filter((call) => call[1] === 'common.errors');
      expect(errorFolderLoads).toHaveLength(1);
    });

    it('should claim nothing while a folder is still loading', () => {
      const pending = new Subject<unknown>();
      apiSpies.getResourceTree.mockReturnValue(pending);

      component.session.onFolderConfirmed('common.errors');
      component.session.entry.form.controls.key.setValue('notFound');
      spectator.detectChanges();

      expect(component.session.location.keyCollision()).toBe(false);
      expect(component.session.location.contextTree().some((node) => node.kind === 'entry')).toBe(false);

      pending.next({ path: 'common.errors', resources: [entry('notFound')], children: [] });
      pending.complete();
      spectator.detectChanges();

      expect(component.session.location.keyCollision()).toBe(true);
    });

    it('should mark the colliding leaf as an existing entry in the context tree', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const leaf = component.session.location.contextTree().find((node) => node.kind === 'entry' && node.name === 'ok');
      expect(leaf?.mark).toBe('exists');
      expect(spectator.query('[data-testid="tree-exists-pill"]')).not.toBeNull();
    });

    it('should mark the colliding row error-coloured rather than accented', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(spectator.queryAll('[data-testid="context-tree"] .ftree-n--taken')).toHaveLength(1);
      expect(spectator.queryAll('[data-testid="context-tree"] .ftree-n--target')).toHaveLength(0);
    });

    it('should turn the footer key the error colour', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).toHaveClass('mono--dup');
    });

    it('should leave the footer key unmarked while the key is free', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('cancel');
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).not.toHaveClass('mono--dup');
    });

    it('should take the footer validity glyph back to idle', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      component.session.entry.form.controls.baseValue.setValue('OK');
      spectator.detectChanges();

      expect(component.session.entry.form.valid).toBe(true);
      expect(component.session.entry.isFormValid()).toBe(false);
    });

    it('should close with shouldOpenEdit from "Open existing"', async () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();

      spectator.click('[data-testid="open-existing"]');
      await Promise.resolve();
      await Promise.resolve();

      expect(closedWith()).toEqual({ kind: 'open-existing', fullKey: 'common.buttons.ok' });
    });

    it('should offer the conflict dialog instead of saving when the key is taken', async () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.session.entry.form.controls.key.setValue('ok');
      component.session.entry.form.controls.baseValue.setValue('OK');
      component.session.entry.form.controls.comment.setValue('The affirmative button');
      spectator.detectChanges();

      await component.session.onSubmit();

      expect(apiSpies.createResource).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalled());
      expect(mockDialog.open.mock.calls.at(-1)?.[1]).toEqual({
        data: {
          title: 'Translation Key Already Exists',
          message:
            'The translation key "common.buttons.ok" already exists in this collection. Would you like to edit the existing translation or choose a different key?',
          confirmButtonText: 'Edit Existing',
          cancelButtonText: 'Choose Different Key',
        },
        width: '500px',
      });
      await vi.waitFor(() => expect(closedWith()).toEqual({ kind: 'open-existing', fullKey: 'common.buttons.ok' }));
    });
  });

  describe('Sticky similar values', () => {
    const hit = (fullKey: string, value: string): SearchResultDto => ({
      ...summary(fullKey, value),
      matchType: 'similar-value',
    });

    const searchReturns = (results: ReturnType<typeof hit>[]): void => {
      apiSpies.searchTranslations.mockReturnValue(
        of({ query: '', results, totalFound: results.length, limited: false }),
      );
    };

    /** Types a value and lets the 300ms debounce run out. */
    const typeAndSettle = (value: string): void => {
      component.session.entry.form.controls.baseValue.setValue(value);
      vi.advanceTimersByTime(300);
      spectator.detectChanges();
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should take no space with zero hits', () => {
      searchReturns([]);
      typeAndSettle('Discard unsaved changes?');

      expect(component.session.showSimilarContext()).toBe(false);
      expect(spectator.query('app-similar-translations')).toBeNull();
    });

    it('should show hits and pin them while the value is unchanged', () => {
      searchReturns([hit('common.actions.save', 'Save')]);
      typeAndSettle('Save changes');

      expect(component.session.showSimilarContext()).toBe(true);

      // Work elsewhere in the form leaves the pinned block alone.
      component.session.entry.form.controls.comment.setValue('A comment');
      component.session.addTagValue('browser');
      vi.advanceTimersByTime(1000);
      spectator.detectChanges();

      expect(component.session.similarCount()).toBe(1);
      expect(spectator.query('app-similar-translations')).not.toBeNull();
    });

    it('should clear the pinned hits the moment the value changes', () => {
      searchReturns([hit('common.actions.save', 'Save')]);
      typeAndSettle('Save changes');
      expect(component.session.similarCount()).toBe(1);

      component.session.entry.form.controls.baseValue.setValue('Save changes now');
      spectator.detectChanges();

      // Before the debounce has even started to run out.
      expect(component.session.similarCount()).toBe(0);
      expect(component.session.showSimilarContext()).toBe(false);
    });

    it('keeps the similar-values spinner through an eligible value’s debounce', () => {
      const pending = new Subject<{
        query: string;
        results: SearchResultDto[];
        totalFound: number;
        limited: boolean;
      }>();
      apiSpies.searchTranslations.mockReturnValue(pending);
      typeAndSettle('Save changes');
      expect(component.session.advisories.isSearchingSimilar()).toBe(true);

      component.session.entry.form.controls.baseValue.setValue('Save changes now');
      expect(component.session.advisories.isSearchingSimilar()).toBe(true);
      vi.advanceTimersByTime(299);
      expect(component.session.advisories.isSearchingSimilar()).toBe(true);
      vi.advanceTimersByTime(1);
      pending.next({ query: 'Save changes now', results: [], totalFound: 0, limited: false });
      expect(component.session.advisories.isSearchingSimilar()).toBe(false);

      component.session.entry.form.controls.baseValue.setValue('Sa');
      expect(component.session.advisories.isSearchingSimilar()).toBe(false);
    });

    it('should stay silent below the three-character floor', () => {
      searchReturns([hit('common.actions.ok', 'OK')]);
      typeAndSettle('OK');

      expect(apiSpies.searchTranslations).not.toHaveBeenCalled();
      expect(component.session.showSimilarContext()).toBe(false);
    });

    it('should show nothing in edit mode until the value differs, and clear again on revert', () => {
      vi.useRealTimers();
      renderDialog(createMockData('edit', summary('common.buttons.saveShortcutHint', 'Press Ctrl + Enter')));
      vi.useFakeTimers();
      searchReturns([hit('common.actions.save', 'Press Ctrl + Enter')]);

      typeAndSettle('Press Ctrl + Enter');
      expect(apiSpies.searchTranslations).not.toHaveBeenCalled();
      expect(component.session.showSimilarContext()).toBe(false);

      typeAndSettle('Press Ctrl + Enter to save');
      expect(component.session.showSimilarContext()).toBe(true);

      typeAndSettle('Press Ctrl + Enter');
      expect(component.session.showSimilarContext()).toBe(false);
    });

    it('should single out a hit carrying the identical text', () => {
      searchReturns([hit('browser.search.clear', 'Clear Search'), hit('common.actions.clearAll', 'Clear All')]);
      typeAndSettle('clear search');

      expect(component.session.exactMatchKey()).toBe('browser.search.clear');
      expect(spectator.query('[data-testid="similar-exact-caption"]')).not.toBeNull();
    });

    it('should break a suggested key only after its dots', () => {
      searchReturns([hit('browser.translationEditor.saveShortcutHint', 'Press Ctrl + Enter to save')]);
      typeAndSettle('Press Ctrl + Enter to save');

      const key = spectator.query('app-similar-translations .result-key');
      expect(key).toBeDefined();
      expect(key?.textContent?.trim()).toBe('browser.translationEditor.saveShortcutHint');
      // One break opportunity per dot, and none inside a segment.
      expect(key?.querySelectorAll('wbr').length).toBe(2);
    });

    it('should leave a merely similar hit unmarked', () => {
      searchReturns([hit('common.actions.clearAll', 'Clear All')]);
      typeAndSettle('Clear Search');

      expect(component.session.exactMatchKey()).toBe('');
      expect(spectator.query('[data-testid="similar-exact-caption"]')).toBeNull();
    });

    it('should ask the API for similar values, one more than it shows, and keep at most ten', () => {
      searchReturns(Array.from({ length: 11 }, (_, index) => hit(`common.actions.save${index}`, 'Save changes')));
      typeAndSettle('Save changes');

      expect(apiSpies.searchTranslations).toHaveBeenCalledWith('test-collection', 'Save changes', 11, 'similar');
      expect(component.session.similarCount()).toBe(10);
    });

    it('should drop the entry being edited and keep the ranked order of the rest', () => {
      vi.useRealTimers();
      renderDialog(createMockData('edit', summary('common.actions.save', 'Save')));
      vi.useFakeTimers();
      searchReturns([
        hit('common.actions.saveDraft', 'Save draft'),
        hit('common.actions.save', 'Save'),
        hit('browser.translationEditor.saveAnyway', 'Save Anyway'),
      ]);

      typeAndSettle('Save draft');

      expect(component.session.advisories.similarResources().map((result) => result.fullKey)).toEqual([
        'common.actions.saveDraft',
        'browser.translationEditor.saveAnyway',
      ]);
      expect(component.session.similarCount()).toBe(2);
    });
  });

  describe('Focus handling', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('should close covering panels and focus the invalid base value after a failed save', async () => {
      component.session.entry.form.controls.key.setValue('valid');
      component.session.entry.form.controls.baseValue.setValue('');
      component.session.panels.openLocalesDrawer();
      component.session.panels.openFolderPopover();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      await component.session.onSubmit();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(component.session.panels.isFolderPopoverOpen()).toBe(false);
      expect(component.session.panels.isLocalesDrawerOpen()).toBe(false);
      expect(document.activeElement).toBe(spectator.query('#translation-editor-base-value'));
      expect(apiSpies.createResource).not.toHaveBeenCalled();
    });

    it('should keep comment focus after the closing confirmation restores focus to Save in a later task', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });
      component.session.entry.form.patchValue({ key: 'test_key', baseValue: 'Test Value', comment: '' });
      spectator.detectChanges();
      vi.advanceTimersByTime(0);
      const save = spectator.query<HTMLButtonElement>('[data-testid="submit"]');
      if (save === null) throw new Error('Missing Save button');
      const restored = vi.fn();

      await component.session.onSubmit();
      setTimeout(() => {
        save.focus();
        restored(document.activeElement);
      });
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(restored).toHaveBeenCalledExactlyOnceWith(save);
      expect(document.activeElement).toBe(spectator.query('#translation-editor-comment'));
      expect(apiSpies.createResource).not.toHaveBeenCalled();
    });

    it('should move focus into the drawer and hand it back on Done', () => {
      component.session.panels.openLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      const drawerField = spectator.query('[data-testid="locales-drawer"] textarea');
      expect(document.activeElement).toBe(drawerField);

      component.session.panels.closeLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(spectator.query('[data-testid="other-locales-row"]'));
    });

    it('should hand focus back to the Other locales row when Escape closes the drawer', async () => {
      component.session.panels.openLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      await component.session.onCancel();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(component.session.panels.isLocalesDrawerOpen()).toBe(false);
      expect(document.activeElement).toBe(spectator.query('[data-testid="other-locales-row"]'));
    });

    it('should move focus to the popover filter and hand it back to the pill', () => {
      component.session.panels.openFolderPopover();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(document.querySelector('[data-testid="folder-filter"]'));

      component.session.confirmStagedFolder();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(spectator.query('[data-testid="location-pill"]'));
    });
  });

  describe('Footer key copy', () => {
    let mockClipboard: { writeText: Mock };

    beforeEach(() => {
      mockClipboard = { writeText: vi.fn(() => Promise.resolve()) };
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
        configurable: true,
      });
      renderDialog(createMockData('create'));
      component.session.entry.form.controls.key.setValue('ok');
      spectator.detectChanges();
    });

    it('should copy the full key and confirm it', async () => {
      spectator.click('[data-testid="footer-key"]');
      await vi.waitFor(() => expect(mockNotifications.success).toHaveBeenCalledWith('Copied to clipboard'));
      spectator.detectChanges();

      expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.ok');
      expect(mockNotifications.success).toHaveBeenCalledWith('Copied to clipboard');
      expect(component.session.keyJustCopied()).toBe(true);
      expect(spectator.query('[data-testid="footer-key"] .footer-key-icon')?.textContent?.trim()).toBe('check');
    });

    it('should say so when the clipboard refuses', async () => {
      mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('denied')));

      spectator.click('[data-testid="footer-key"]');
      await vi.waitFor(() => expect(mockNotifications.error).toHaveBeenCalledWith('Failed to copy'));
      spectator.detectChanges();

      expect(mockNotifications.error).toHaveBeenCalledWith('Failed to copy');
      expect(component.session.keyJustCopied()).toBe(false);
    });

    it('should keep the collision colour on the copy button', () => {
      const store = spectator.inject(BrowserStore);
      patchState(unprotected(store), {
        currentFolderPath: 'common.buttons',
        translations: [summary('common.buttons.ok', 'OK')],
      });
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).toHaveClass('mono--dup');
    });
  });
  describe('Preferred terminology advisories', () => {
    const expenditure = {
      discouraged: 'Expenditure',
      preferred: 'Investment',
      reason: 'Former financial-planning term.',
    };
    const customField = { discouraged: 'Custom Field', preferred: 'Configurable Field' };

    const useRules = (rules: LingoTrackerConfigDto['preferredTerminology'], error?: string): void => {
      mockConfig.set({
        baseLocale: 'en',
        locales: ['en', 'fr', 'de'],
        collections: {},
        preferredTerminology: rules,
        preferredTerminologyError: error,
      } as LingoTrackerConfigDto);
    };

    const advisories = (): HTMLElement[] => spectator.queryAll<HTMLElement>('[data-testid="preferred-term-advisory"]');
    const baseTextarea = (): HTMLTextAreaElement | null =>
      spectator.query<HTMLTextAreaElement>('#translation-editor-base-value');

    const openEditing = (baseValue: string): void => {
      renderDialog(createMockData('edit', summary('common.buttons.label', baseValue)));
    };

    const type = (value: string, settle = true): void => {
      component.session.entry.form.controls.baseValue.setValue(value);
      if (settle) {
        vi.advanceTimersByTime(PREFERRED_TERM_DEBOUNCE_MS);
      }
      spectator.detectChanges();
    };

    beforeEach(() => {
      useRules([expenditure, customField]);
      renderDialog(createMockData('create'));
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should wait for a typing pause before advising', () => {
      component.session.entry.form.controls.baseValue.setValue('Capital Expenditure');
      vi.advanceTimersByTime(PREFERRED_TERM_DEBOUNCE_MS - 1);
      spectator.detectChanges();
      expect(advisories()).toHaveLength(0);

      vi.advanceTimersByTime(1);
      spectator.detectChanges();

      expect(advisories()).toHaveLength(1);
      expect(advisories()[0].textContent).toContain(
        'Preferred terminology: consider “Investment” instead of “Expenditure”.',
      );
      expect(spectator.query('[data-testid="preferred-term-use"]')?.textContent?.trim()).toBe('Use “Investment”');
    });

    it('should advise at once when an existing value opens', () => {
      openEditing('Review the expenditure');

      expect(advisories()).toHaveLength(1);
    });

    it('should show one advisory per matched rule', () => {
      type('Expenditure on the Custom Field, and more expenditure');

      expect(advisories()).toHaveLength(2);
      expect(advisories()[0].textContent).toContain('“Expenditure”');
      expect(advisories()[1].textContent).toContain('“Custom Field”');
    });

    it('should show the reason only when the rule has one', () => {
      type('Expenditure on the Custom Field');

      const [withReason, withoutReason] = advisories();
      expect(withReason.querySelector('[data-testid="preferred-term-reason"]')?.textContent?.trim()).toBe(
        'Former financial-planning term.',
      );
      expect(withoutReason.querySelector('[data-testid="preferred-term-reason"]')).toBeNull();
    });

    it('should replace every occurrence on Use without saving', () => {
      component.session.entry.form.controls.key.setValue('label');
      type('Expenditure, expenditure-report and {expenditure} stay');

      spectator.click('[data-testid="preferred-term-use"]');
      spectator.detectChanges();

      expect(component.session.entry.form.controls.baseValue.value).toBe(
        'Investment, Investment-report and {expenditure} stay',
      );
      expect(component.session.entry.form.controls.baseValue.dirty).toBe(true);
      expect(apiSpies.createResource).not.toHaveBeenCalled();
      expect(apiSpies.updateResource).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      // Gone without waiting out the debounce.
      expect(advisories()).toHaveLength(0);
      expect(spectator.query<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(false);
      expect(component.session.entry.isFormValid()).toBe(true);
    });

    it('should hand focus back to the field after Use', () => {
      type('Expenditure');

      spectator.click('[data-testid="preferred-term-use"]');

      vi.advanceTimersByTime(0);
      expect(document.activeElement).toBe(baseTextarea());
    });

    it('should run the normal value-change flow on Use', () => {
      type('Total expenditure for the year');
      apiSpies.searchTranslations.mockClear();

      spectator.click('[data-testid="preferred-term-use"]');
      vi.advanceTimersByTime(300);

      expect(component.session.entry.form.controls.baseValue.value).toBe('Total Investment for the year');
      expect(apiSpies.searchTranslations).toHaveBeenCalledWith(
        'test-collection',
        'Total Investment for the year',
        expect.any(Number),
        'similar',
      );
    });

    it('should leave only the untouched rule after Use', () => {
      type('Expenditure on the Custom Field');

      spectator.click('[data-testid="preferred-term-use"]');
      spectator.detectChanges();

      expect(advisories()).toHaveLength(1);
      expect(advisories()[0].textContent).toContain('“Custom Field”');
    });

    it('should drop the advisory once the term is removed', () => {
      type('Expenditure');
      expect(advisories()).toHaveLength(1);

      type('Investment');

      expect(advisories()).toHaveLength(0);
    });

    it('should not block saving or make the field invalid', async () => {
      component.session.entry.form.controls.key.setValue('label');
      component.session.entry.form.controls.comment.setValue('A comment');
      type('Expenditure');

      expect(component.session.entry.form.controls.baseValue.valid).toBe(true);
      expect(component.session.entry.isFormValid()).toBe(true);

      await component.session.onSubmit();

      expect(apiSpies.createResource).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should render nothing without rules', () => {
      useRules(undefined);
      openEditing('Expenditure');

      expect(spectator.query('app-preferred-term-advisories')).toBeNull();
    });

    it('should render nothing when the rule file failed to load', () => {
      useRules(undefined, 'Invalid JSON');
      openEditing('Expenditure');

      expect(spectator.query('app-preferred-term-advisories')).toBeNull();
    });

    it('should describe the field with the advisories only while they exist', () => {
      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe('translation-editor-icu-hint');

      type('Expenditure');

      const container = spectator.query(`#${component.presentation.preferredTermAdvisoriesId}`);
      expect(container).not.toBeNull();
      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe(
        `translation-editor-icu-hint ${component.presentation.preferredTermAdvisoriesId}`,
      );

      type('Investment');

      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe('translation-editor-icu-hint');
    });

    it('should keep the base-value error in the description alongside the advisories', () => {
      type('Expenditure');
      component.session.entry.submitAttempted.set(true);
      component.session.entry.form.controls.baseValue.setErrors({ required: true });
      spectator.detectChanges();

      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe(
        `translation-editor-base-value-error ${component.presentation.preferredTermAdvisoriesId}`,
      );
    });

    it('should not announce advisories as a live region', () => {
      type('Expenditure on the Custom Field');

      const advisoryRoot = spectator.query('app-preferred-term-advisories');
      expect(advisoryRoot?.querySelector('[aria-live]')).toBeNull();
      expect(advisoryRoot?.querySelector('[role="status"], [role="alert"], [role="log"]')).toBeNull();
      expect(advisoryRoot?.closest('[aria-live]')).toBeNull();
    });

    it('should advise without offering Use when read-only', () => {
      renderDialog({
        ...createMockData('edit', summary('common.buttons.label', 'Expenditure')),
        readOnly: true,
      });

      expect(advisories()).toHaveLength(1);
      expect(spectator.query('[data-testid="preferred-term-use"]')).toBeNull();
    });
  });
});
