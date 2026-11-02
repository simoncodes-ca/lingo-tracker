import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { LingoTrackerConfigDto, PreferredTermRuleErrorDto } from '@simoncodes-ca/data-transfer';
import { toRuntimeValue, validateICUSyntax } from '@simoncodes-ca/domain';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ruleErrorEntries from '../../i18n/settings/preferredTerminology/error/resource_entries.json';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import { CollectionsStore } from '../collections/store/collections.store';
import { toApiError } from '../shared/api-error/api-error';
import { NotificationService } from '../shared/notification';
import { Settings } from './settings';

/** A refused save, as the Config Write reports it. */
const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } })));

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let component: Settings;
  let spectator: Spectator<Settings>;
  const updateGlobalConfigMock = vi.fn();
  const notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };

  const baseConfig: LingoTrackerConfigDto = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {},
    protectedTerms: ['iPhone', 'Node.js'],
    protectedTermsFilePath: '/project/.lingo-tracker-protected-terms.json',
  };

  const buildStore = (config: LingoTrackerConfigDto | null, error: string | null = null) => ({
    config: signal(config),
    error: signal(error),
    isLoading: signal(false),
    updateGlobalConfig: updateGlobalConfigMock,
  });

  const createComponent = createComponentFactory({
    component: Settings,
    imports: [getTranslocoTestingModule()],
    providers: [
      { provide: CollectionsStore, useFactory: () => buildStore(null) },
      { provide: NotificationService, useValue: notifications },
    ],
    detectChanges: false,
  });

  const renderStore = (store: ReturnType<typeof buildStore>): Settings => {
    spectator = createComponent({ providers: [{ provide: CollectionsStore, useValue: store }] });
    fixture = spectator.fixture;
    component = spectator.component;
    spectator.detectChanges();
    spectator.flushEffects();
    return component;
  };

  /** Creates the component against a store, and returns it after a first render. */
  const render = (config: LingoTrackerConfigDto | null, error: string | null = null) => {
    return renderStore(buildStore(config, error));
  };

  const termValues = () => component.draft.terms.entries().map((entry) => entry.value);
  const entryFor = (value: string) => {
    const entry = component.draft.terms.entries().find((candidate) => candidate.value === value);
    expect(entry).toBeDefined();
    return entry;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // A save is accepted unless a test says otherwise; its answer is the config as saved.
    updateGlobalConfigMock.mockReturnValue(of(baseConfig));
  });

  it('renders global protected terms seeded from the store config', () => {
    render(baseConfig);

    expect(termValues()).toEqual(['iPhone', 'Node.js']);
    expect(fixture.nativeElement.textContent).toContain('iPhone');
    expect(fixture.nativeElement.querySelectorAll('.term')).toHaveLength(2);
  });

  it('names the file the terms are stored in', () => {
    render(baseConfig);

    expect(component.protectedTermsFilePath()).toBe('/project/.lingo-tracker-protected-terms.json');
    expect(fixture.nativeElement.querySelector('.terms-file')).not.toBeNull();
  });

  it('omits the file line when the API reports no path', () => {
    render({ ...baseConfig, protectedTermsFilePath: undefined });

    expect(fixture.nativeElement.querySelector('.terms-file')).toBeNull();
  });

  it('shows the empty state when there are no terms', () => {
    render({ ...baseConfig, protectedTerms: [] });

    expect(component.draft.terms.isEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelector('.terms-empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.terms-list')).toBeNull();
  });

  describe('filtering', () => {
    const manyTerms = { ...baseConfig, protectedTerms: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'iPhone'] };

    it('offers no filter on a list short enough to scan', () => {
      render(baseConfig);

      expect(component.draft.terms.showFilter()).toBe(false);
      expect(fixture.nativeElement.querySelector('.terms-filter')).toBeNull();
    });

    it('offers a filter once the list is long enough to need one', () => {
      render(manyTerms);

      expect(component.draft.terms.showFilter()).toBe(true);
      expect(fixture.nativeElement.querySelector('.terms-filter')).not.toBeNull();
    });

    it('renders and reveals an added row after its filter is cleared', () => {
      render(manyTerms);
      component.draft.terms.filter.set('a1');
      spectator.detectChanges();
      component.draft.terms.onAddDraftChange('Zod');
      component.draft.terms.addTerm();
      spectator.detectChanges();
      spectator.flushEffects();

      expect(component.draft.terms.filter()).toBe('');
      expect(fixture.nativeElement.querySelectorAll('.term')).toHaveLength(10);
      expect(fixture.nativeElement.textContent).toContain('Zod');
      expect(component.draft.terms.revealId()).toBeNull();
    });
  });

  describe('saving', () => {
    it('sends the surviving terms in display order', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;
      component.draft.terms.removeTerm(entry);
      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();

      component.save();

      expect(updateGlobalConfigMock).toHaveBeenCalledWith({ protectedTerms: ['C++', 'Node.js'] });
    });

    it('does nothing when there is nothing to save', () => {
      render(baseConfig);

      component.save();

      expect(updateGlobalConfigMock).not.toHaveBeenCalled();
    });

    it('revert all restores the saved list', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;
      component.draft.terms.removeTerm(entry);
      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();

      component.revertAll();

      expect(component.draft.terms.termsToSave()).toEqual(['iPhone', 'Node.js']);
      expect(component.draft.terms.hasChanges()).toBe(false);
    });

    it('surfaces a failed config load to the user', () => {
      render(null, 'update failed');

      expect(fixture.nativeElement.textContent).toContain('update failed');
    });

    it('does not clobber in-progress edits on a config reload it did not ask for', () => {
      const config = signal(baseConfig);
      renderStore({
        config,
        error: signal(null),
        isLoading: signal(false),
        updateGlobalConfig: updateGlobalConfigMock,
      });

      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      config.set({ ...baseConfig, protectedTerms: ['iPhone', 'Node.js'] });
      fixture.detectChanges();

      expect(component.draft.terms.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
    });

    it('adopts the saved config as the new baseline and toasts once when the save is accepted', () => {
      render(baseConfig);
      updateGlobalConfigMock.mockReturnValueOnce(of({ ...baseConfig, protectedTerms: ['C++', 'iPhone', 'Node.js'] }));

      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      component.save();
      fixture.detectChanges();

      expect(component.draft.terms.hasChanges()).toBe(false);
      expect(component.draft.terms.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
      expect(notifications.success).toHaveBeenCalledTimes(1);
      expect(notifications.success).toHaveBeenCalledWith('Global settings saved');
      expect(component.saveError()).toBeNull();
    });

    it('treats the sent lists as saved and toasts once when the save is accepted but its reload fails', () => {
      render(baseConfig);
      updateGlobalConfigMock.mockReturnValueOnce(of(null));

      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      component.addRule();
      const [rule] = component.draft.terminology.rowViews();
      expect(rule).toBeDefined();
      component.onRuleInput(rule?.row.id ?? -1, 'discouraged', 'utilize');
      component.onRuleInput(rule?.row.id ?? -1, 'preferred', 'use');
      component.save();
      fixture.detectChanges();

      expect(component.draft.saving()).toBe(false);
      expect(component.draft.hasChanges()).toBe(false);
      expect(component.draft.terms.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
      expect(component.draft.terminology.rulesToSave()).toEqual([{ discouraged: 'utilize', preferred: 'use' }]);
      expect(notifications.success).toHaveBeenCalledTimes(1);
      expect(notifications.success).toHaveBeenCalledWith('Global settings saved');
      expect(component.saveError()).toBeNull();
    });

    it('shows the refusal, keeps the edits and toasts nothing when the save is rejected', () => {
      render(baseConfig);
      updateGlobalConfigMock.mockReturnValueOnce(
        rejection(400, { message: 'protectedTerms must be an array of strings' }),
      );

      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      component.save();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('protectedTerms must be an array of strings');
      expect(component.draft.terms.hasChanges()).toBe(true);
      expect(component.draft.terms.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
      expect(notifications.success).not.toHaveBeenCalled();
    });

    it('falls back to the save-failed text for a refusal without a message', () => {
      render(baseConfig);
      updateGlobalConfigMock.mockReturnValueOnce(rejection(500, { error: 'Internal Server Error' }));

      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      component.save();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Failed to save settings');
    });
  });

  describe('preferred terminology', () => {
    const TERMINOLOGY_PATH = '/project/.lingo-tracker-preferred-terminology.json';
    const terminologyConfig: LingoTrackerConfigDto = {
      ...baseConfig,
      preferredTerminology: [
        { discouraged: 'E-mail', preferred: 'email' },
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Current planning term.' },
      ],
      preferredTerminologyFilePath: TERMINOLOGY_PATH,
    };

    const host = (): HTMLElement => fixture.nativeElement;
    const ruleRows = () => Array.from(host().querySelectorAll<HTMLElement>('li.rule'));
    const ruleInput = (row: number, field: 'discouraged' | 'preferred' | 'reason'): HTMLInputElement => {
      const input =
        ruleRows()[row]?.querySelectorAll<HTMLInputElement>('input.rule-input')[
          ['discouraged', 'preferred', 'reason'].indexOf(field)
        ];
      expect(input).toBeDefined();
      return input as HTMLInputElement;
    };
    const type = (row: number, field: 'discouraged' | 'preferred' | 'reason', value: string) => {
      const input = ruleInput(row, field);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      spectator.detectChanges();
    };
    const blur = (row: number, field: 'discouraged' | 'preferred' | 'reason') => {
      ruleInput(row, field).dispatchEvent(new Event('blur'));
      spectator.detectChanges();
    };
    const errorFor = (row: number, field: 'discouraged' | 'preferred' | 'reason') => {
      const id = ruleInput(row, field).getAttribute('aria-describedby');
      return id ? (host().querySelector(`#${id}`)?.textContent?.trim() ?? null) : null;
    };
    const saveButton = (): HTMLButtonElement => {
      const button = host().querySelector<HTMLButtonElement>('button.settings-save');
      expect(button).not.toBeNull();
      return button as HTMLButtonElement;
    };
    const clickAdd = () => {
      host().querySelector<HTMLButtonElement>('button.rules-add')?.click();
      spectator.detectChanges();
      spectator.flushEffects();
    };

    it('renders one row per rule with the backing file path', () => {
      render(terminologyConfig);

      expect(ruleRows()).toHaveLength(2);
      expect(ruleInput(0, 'discouraged').value).toBe('E-mail');
      expect(ruleInput(1, 'preferred').value).toBe('Investment');
      expect(ruleInput(1, 'reason').value).toBe('Current planning term.');
      expect(host().querySelector(`.rules [title="${TERMINOLOGY_PATH}"]`)).not.toBeNull();
    });

    it('labels inputs per row and names the term on the remove button', () => {
      render(terminologyConfig);

      expect(ruleInput(1, 'discouraged').getAttribute('aria-label')).toBe(
        'settings.preferredTerminology.discouragedAriaX',
      );
      const remove = ruleRows()[1]?.querySelector('button.rule-remove');
      expect(remove?.getAttribute('aria-label')).toBe('settings.preferredTerminology.removeAriaX');
    });

    it('shows the empty state when there are no rules', () => {
      render(baseConfig);

      expect(ruleRows()).toHaveLength(0);
      expect(host().textContent).toContain('settings.preferredTerminology.emptyTitle');
    });

    it('adds a blank row and focuses its discouraged input', () => {
      render(terminologyConfig);

      clickAdd();

      expect(ruleRows()).toHaveLength(3);
      expect(document.activeElement).toBe(ruleInput(2, 'discouraged'));
      expect(component.draft.terminology.changeCount()).toBe(1);
    });

    it('does not show "required" on a blank new row until a field is touched', () => {
      render(terminologyConfig);
      clickAdd();

      expect(errorFor(2, 'discouraged')).toBeNull();
      expect(errorFor(2, 'preferred')).toBeNull();

      type(2, 'discouraged', 'Cost');
      expect(errorFor(2, 'preferred')).toBeNull();

      blur(2, 'preferred');
      expect(errorFor(2, 'preferred')).toBe('settings.preferredTerminology.error.empty');
    });

    it('edits a rule and counts it as a change', () => {
      render(terminologyConfig);

      type(1, 'preferred', 'Capital');

      expect(component.draft.terminology.rulesToSave()[1]).toEqual({
        discouraged: 'Expenditure',
        preferred: 'Capital',
        reason: 'Current planning term.',
      });
      expect(component.draft.terminology.changeCount()).toBe(1);
      expect(ruleRows()[1]?.getAttribute('data-status')).toBe('edited');
    });

    it('removes a rule', () => {
      render(terminologyConfig);

      (ruleRows()[0]?.querySelector('button.rule-remove') as HTMLButtonElement | null)?.click();
      spectator.detectChanges();

      expect(ruleRows()).toHaveLength(1);
      expect(component.draft.terminology.rulesToSave()).toEqual([
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Current planning term.' },
      ]);
      expect(component.draft.terminology.changeCount()).toBe(1);
    });

    it('flags a duplicate discouraged term inline', () => {
      render(terminologyConfig);
      clickAdd();

      type(2, 'preferred', 'Spend');
      type(2, 'discouraged', 'expenditure');

      expect(errorFor(2, 'discouraged')).toBe('settings.preferredTerminology.error.duplicateX');
      expect(ruleInput(2, 'discouraged').getAttribute('aria-invalid')).toBe('true');
    });

    it('flags a chain on the preferred term', () => {
      render(terminologyConfig);
      clickAdd();

      type(2, 'discouraged', 'Spend');
      type(2, 'preferred', 'Expenditure');

      expect(errorFor(2, 'preferred')).toBe('settings.preferredTerminology.error.chainX');
    });

    it('flags a preferred term containing a discouraged term', () => {
      render(terminologyConfig);

      type(1, 'preferred', 'Capital expenditure');

      expect(errorFor(1, 'preferred')).toBe('settings.preferredTerminology.error.containsDiscouragedX');
    });

    it('flags an existing rule when a new row turns it into a chain', () => {
      render(terminologyConfig);
      clickAdd();

      type(2, 'discouraged', 'Investment');
      type(2, 'preferred', 'Capital');

      expect(errorFor(1, 'preferred')).toBe('settings.preferredTerminology.error.chainX');
    });

    it('describes errors with the terms involved', () => {
      render(terminologyConfig);
      clickAdd();
      type(2, 'discouraged', 'Spend');
      type(2, 'preferred', 'Expenditure');

      expect(component.draft.terminology.rowViews()[2]?.errors.preferred).toEqual({
        code: 'chain',
        params: { term: 'Expenditure', preferred: 'Investment' },
      });
    });

    it('keeps Save disabled until something changes', () => {
      render(terminologyConfig);

      expect(saveButton().disabled).toBe(true);

      type(0, 'reason', 'House style.');

      expect(saveButton().disabled).toBe(false);
    });

    it('disables Save while an error is showing', () => {
      render(terminologyConfig);

      type(1, 'preferred', 'expenditure');

      expect(saveButton().disabled).toBe(true);
    });

    it('reveals hidden errors instead of saving a blank new row', () => {
      render(terminologyConfig);
      clickAdd();
      expect(saveButton().disabled).toBe(false);

      saveButton().click();
      spectator.detectChanges();
      spectator.flushEffects();

      expect(updateGlobalConfigMock).not.toHaveBeenCalled();
      expect(errorFor(2, 'discouraged')).toBe('settings.preferredTerminology.error.empty');
      expect(errorFor(2, 'preferred')).toBe('settings.preferredTerminology.error.empty');
      expect(saveButton().disabled).toBe(true);
      expect(document.activeElement).toBe(ruleInput(2, 'discouraged'));
    });

    it('saves the normalized list and leaves protected terms out when they did not change', () => {
      render(terminologyConfig);
      clickAdd();
      type(2, 'discouraged', '  Cost ');
      type(2, 'preferred', 'Price');
      type(2, 'reason', '   ');

      saveButton().click();

      expect(updateGlobalConfigMock).toHaveBeenCalledWith({
        preferredTerminology: [
          { discouraged: 'E-mail', preferred: 'email' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Current planning term.' },
          { discouraged: 'Cost', preferred: 'Price' },
        ],
      });
    });

    it('sends both lists in one request when both changed', () => {
      render(terminologyConfig);
      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();
      type(0, 'preferred', 'Email');

      component.save();

      expect(updateGlobalConfigMock).toHaveBeenCalledWith({
        protectedTerms: ['C++', 'iPhone', 'Node.js'],
        preferredTerminology: [
          { discouraged: 'E-mail', preferred: 'Email' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Current planning term.' },
        ],
      });
    });

    it('re-seeds rows from the saved config a save answers with, in the server order', () => {
      render(terminologyConfig);
      updateGlobalConfigMock.mockReturnValueOnce(
        of({
          ...terminologyConfig,
          preferredTerminology: [
            { discouraged: 'Cost', preferred: 'Price' },
            ...(terminologyConfig.preferredTerminology ?? []),
          ],
        }),
      );
      clickAdd();
      type(2, 'discouraged', 'Cost');
      type(2, 'preferred', 'Price');

      component.save();
      spectator.detectChanges();
      spectator.flushEffects();
      spectator.detectChanges();

      expect(ruleRows().map((row) => row.querySelector<HTMLInputElement>('input')?.value)).toEqual([
        'Cost',
        'E-mail',
        'Expenditure',
      ]);
      expect(component.draft.terminology.hasChanges()).toBe(false);
    });

    it('maps the rule errors of a rejected save onto the submitted rows and clears one when its field is edited', () => {
      render(terminologyConfig);
      const errors: PreferredTermRuleErrorDto[] = [
        { index: 1, field: 'preferred', code: 'self-mapping', message: 'server says no' },
      ];
      updateGlobalConfigMock.mockReturnValueOnce(
        rejection(400, { message: 'Invalid preferred terminology rules', errors: [...errors, 'not a rule error'] }),
      );
      type(1, 'reason', 'Changed.');

      component.save();
      spectator.detectChanges();

      expect(errorFor(1, 'preferred')).toBe('settings.preferredTerminology.error.selfMapping');
      expect(errorFor(0, 'preferred')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Invalid preferred terminology rules');
      expect(notifications.success).not.toHaveBeenCalled();
      expect(component.draft.terminology.changeCount()).toBe(1);

      type(1, 'preferred', 'Capital');

      expect(errorFor(1, 'preferred')).toBeNull();
    });

    it('shows a banner when the terminology file failed to load, and still allows saving a fix', () => {
      render({
        ...baseConfig,
        preferredTerminologyFilePath: TERMINOLOGY_PATH,
        preferredTerminologyError: 'Preferred terminology file is not valid JSON',
      });

      const banner = host().querySelector('.rules-load-error');
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('settings.preferredTerminology.loadError');
      expect(banner?.textContent).toContain('Preferred terminology file is not valid JSON');
      expect(host().textContent).not.toContain('settings.preferredTerminology.emptyTitle');

      clickAdd();
      type(0, 'discouraged', 'Cost');
      type(0, 'preferred', 'Price');
      saveButton().click();

      expect(updateGlobalConfigMock).toHaveBeenCalledWith({
        preferredTerminology: [{ discouraged: 'Cost', preferred: 'Price' }],
      });
    });

    it('does not rewrite a broken terminology file when only protected terms are saved', () => {
      render({ ...baseConfig, preferredTerminologyError: 'broken' });
      component.draft.terms.onAddDraftChange('C++');
      component.draft.terms.addTerm();

      component.save();

      expect(updateGlobalConfigMock).toHaveBeenCalledWith({ protectedTerms: ['C++', 'iPhone', 'Node.js'] });
    });

    it('notes a missing explicit file without an error banner', () => {
      render({ ...baseConfig, preferredTerminologyWarning: 'Preferred terminology file not found' });

      expect(host().querySelector('.rules-load-error')).toBeNull();
      expect(host().textContent).toContain('settings.preferredTerminology.missingFile');
    });

    it('reverts terminology edits with Revert all', () => {
      render(terminologyConfig);
      type(0, 'preferred', 'Email');
      clickAdd();

      component.revertAll();
      spectator.detectChanges();

      expect(ruleRows()).toHaveLength(2);
      expect(ruleInput(0, 'preferred').value).toBe('email');
      expect(component.draft.hasChanges()).toBe(false);
    });

    describe('editing lock', () => {
      const addRuleButton = (): HTMLButtonElement => {
        const button = host().querySelector<HTMLButtonElement>('button.rules-add');
        expect(button).not.toBeNull();
        return button as HTMLButtonElement;
      };
      const protectedAddInput = (): HTMLInputElement => {
        const input = host().querySelector<HTMLInputElement>('.terms-add input');
        expect(input).not.toBeNull();
        return input as HTMLInputElement;
      };
      /** Every control that changes either list: rule inputs, rule and term buttons, the term add field. */
      const editControls = () =>
        Array.from(
          host().querySelectorAll<HTMLInputElement | HTMLButtonElement>(
            'input.rule-input, button.rule-remove, button.rules-add, .terms-add input, .term-action, .term-undo',
          ),
        );
      const buildPendingStore = () => ({
        config: signal<LingoTrackerConfigDto | null>(terminologyConfig),
        error: signal<string | null>(null),
        isLoading: signal(false),
        updateGlobalConfig: updateGlobalConfigMock,
      });
      const saved: LingoTrackerConfigDto = {
        ...terminologyConfig,
        preferredTerminology: [
          { discouraged: 'E-mail', preferred: 'Email' },
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Current planning term.' },
        ],
      };
      const settle = () => {
        spectator.detectChanges();
        spectator.flushEffects();
        spectator.detectChanges();
      };

      it('keeps both lists read-only until the config has loaded', () => {
        const store = { ...buildPendingStore(), config: signal<LingoTrackerConfigDto | null>(null) };
        renderStore(store);

        expect(component.editingLocked()).toBe(true);
        expect(addRuleButton().disabled).toBe(true);
        expect(protectedAddInput().disabled).toBe(true);

        store.config.set(terminologyConfig);
        settle();

        expect(component.editingLocked()).toBe(false);
        expect(addRuleButton().disabled).toBe(false);
        expect(editControls().every((control) => !control.disabled)).toBe(true);
      });

      it('does not let a rule be added before the config seeds the list', () => {
        const store = { ...buildPendingStore(), config: signal<LingoTrackerConfigDto | null>(null) };
        renderStore(store);

        clickAdd();

        expect(ruleRows()).toHaveLength(0);
        expect(component.draft.terminology.isEmpty()).toBe(true);

        store.config.set(terminologyConfig);
        settle();

        expect(ruleRows()).toHaveLength(2);
        expect(component.draft.terminology.hasChanges()).toBe(false);
      });

      it('locks every edit control while a save is in flight and unlocks once its answer arrives', () => {
        const answer = new Subject<LingoTrackerConfigDto>();
        updateGlobalConfigMock.mockReturnValueOnce(answer);
        renderStore(buildPendingStore());
        type(0, 'preferred', 'Email');

        saveButton().click();
        spectator.detectChanges();

        expect(updateGlobalConfigMock).toHaveBeenCalled();
        expect(editControls().length).toBeGreaterThan(0);
        expect(editControls().every((control) => control.disabled)).toBe(true);
        expect(saveButton().disabled).toBe(true);

        // A rule cannot be started that the post-save reseed would wipe.
        clickAdd();
        expect(ruleRows()).toHaveLength(2);

        answer.next(saved);
        answer.complete();
        settle();

        expect(editControls().every((control) => !control.disabled)).toBe(true);
        expect(ruleInput(0, 'preferred').value).toBe('Email');
        expect(notifications.success).toHaveBeenCalledTimes(1);
      });

      it('unlocks after a rejected save and keeps the unsaved edits', () => {
        const answer = new Subject<LingoTrackerConfigDto>();
        updateGlobalConfigMock.mockReturnValueOnce(answer);
        renderStore(buildPendingStore());
        type(0, 'preferred', 'Email');

        saveButton().click();
        spectator.detectChanges();
        expect(addRuleButton().disabled).toBe(true);

        answer.error(toApiError(new HttpErrorResponse({ status: 502, error: { message: 'update failed' } })));
        settle();

        expect(editControls().every((control) => !control.disabled)).toBe(true);
        expect(ruleInput(0, 'preferred').value).toBe('Email');
        expect(component.draft.terminology.changeCount()).toBe(1);
        expect(host().textContent).toContain('update failed');
        expect(notifications.success).not.toHaveBeenCalled();
      });

      it('keeps an edit made once a save has completed when a later config reload arrives', () => {
        const store = buildPendingStore();
        updateGlobalConfigMock.mockReturnValueOnce(of(saved));
        renderStore(store);
        type(0, 'preferred', 'Email');
        saveButton().click();
        settle();

        clickAdd();
        type(2, 'discouraged', 'Cost');
        type(2, 'preferred', 'Price');
        store.config.set({ ...saved });
        settle();

        expect(ruleRows()).toHaveLength(3);
        expect(component.draft.terminology.rulesToSave()[2]).toEqual({ discouraged: 'Cost', preferred: 'Price' });
      });
    });

    describe('rule error messages', () => {
      /** The app renders through the messageformat transpiler, so every stored value must be valid ICU. */
      it('stores every rule error as valid ICU in every locale', () => {
        for (const [key, entry] of Object.entries(ruleErrorEntries)) {
          for (const [field, value] of Object.entries(entry)) {
            if (field === 'comment' || field === 'tags') continue;
            expect(validateICUSyntax(value as string), `${key} (${field}): ${value}`).toBe(true);
          }
        }
      });

      const createWithMessageformat = createComponentFactory({
        component: Settings,
        imports: [
          getTranslocoTestingModule({
            langs: {
              en: {
                // The bundled form, as `lingo-tracker bundle` writes it.
                [TRACKER_TOKENS.SETTINGS.PREFERREDTERMINOLOGY.ERROR.INVALIDCHARACTER]: toRuntimeValue(
                  ruleErrorEntries.invalidCharacter.source,
                  'transloco-messageformat',
                ),
              },
            },
          }),
        ],
        providers: [provideTranslocoMessageformat()],
        detectChanges: false,
      });

      it('renders the invalid-character error with its literal braces', () => {
        spectator = createWithMessageformat({
          providers: [{ provide: CollectionsStore, useValue: buildStore(terminologyConfig) }],
        });
        fixture = spectator.fixture;
        component = spectator.component;
        spectator.detectChanges();
        spectator.flushEffects();

        type(0, 'discouraged', 'E-{mail}');

        expect(errorFor(0, 'discouraged')).toBe('Cannot contain { } < or >');
      });
    });
  });
});
