import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Settings } from './settings';
import { CollectionsStore } from '../collections/store/collections.store';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let component: Settings;
  const updateGlobalConfigMock = vi.fn();

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

  /** Creates the component against a store, and returns it after a first render. */
  const render = (config: LingoTrackerConfigDto | null, error: string | null = null) => {
    TestBed.overrideProvider(CollectionsStore, { useValue: buildStore(config, error) });
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return component;
  };

  const termValues = () => component.entries().map((entry) => entry.value);
  const entryFor = (value: string) => {
    const entry = component.entries().find((candidate) => candidate.value === value);
    expect(entry).toBeDefined();
    return entry;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [Settings, NoopAnimationsModule, getTranslocoTestingModule()],
      providers: [{ provide: CollectionsStore, useValue: buildStore(null) }],
    }).compileComponents();
  });

  it('renders global protected terms seeded from the store config', () => {
    render(baseConfig);

    expect(termValues()).toEqual(['iPhone', 'Node.js']);
    expect(fixture.nativeElement.textContent).toContain('iPhone');
    expect(fixture.nativeElement.querySelectorAll('.term')).toHaveLength(2);
  });

  it('lists terms alphabetically regardless of the order the file stored them in', () => {
    render({ ...baseConfig, protectedTerms: ['zulu', 'Alpha', 'mike'] });

    expect(component.sortedEntries().map((entry) => entry.value)).toEqual(['Alpha', 'mike', 'zulu']);
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

    expect(component.isEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelector('.terms-empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.terms-list')).toBeNull();
  });

  describe('adding', () => {
    it('adds a trimmed term and clears the draft', () => {
      render(baseConfig);

      component.onAddDraftChange('  C++  ');
      component.addTerm();

      expect(termValues()).toContain('C++');
      expect(component.addDraft()).toBe('');
      expect(component.changeCount()).toBe(1);
    });

    it('refuses a duplicate and reports which term collided', () => {
      render(baseConfig);

      component.onAddDraftChange('iPhone');
      component.addTerm();

      expect(component.addError()).toBe('iPhone');
      expect(termValues()).toEqual(['iPhone', 'Node.js']);
    });

    it('clears the duplicate error as soon as the draft changes', () => {
      render(baseConfig);
      component.onAddDraftChange('iPhone');
      component.addTerm();

      component.onAddDraftChange('iPhon');

      expect(component.addError()).toBeNull();
    });

    it('re-adding a term that is marked for removal takes the removal back', () => {
      render(baseConfig);
      const removed = entryFor('iPhone');
      if (!removed) return;
      component.removeTerm(removed);

      component.onAddDraftChange('iPhone');
      component.addTerm();

      expect(component.addError()).toBeNull();
      expect(entryFor('iPhone')?.removed).toBe(false);
      expect(component.changeCount()).toBe(0);
    });
  });

  describe('removing', () => {
    it('keeps a saved term visible and marked until the change is saved', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;

      component.removeTerm(entry);

      expect(termValues()).toContain('iPhone');
      expect(component.statusOf(entryFor('iPhone') ?? entry)).toBe('removed');
      expect(component.termsToSave()).toEqual(['Node.js']);
      expect(component.changeCount()).toBe(1);
    });

    it('restores a term marked for removal', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;
      component.removeTerm(entry);

      component.restoreTerm(entryFor('iPhone') ?? entry);

      expect(component.termsToSave()).toEqual(['iPhone', 'Node.js']);
      expect(component.hasChanges()).toBe(false);
    });

    it('drops a term added in this session outright rather than marking it', () => {
      render(baseConfig);
      component.onAddDraftChange('C++');
      component.addTerm();

      const added = entryFor('C++');
      if (!added) return;
      component.removeTerm(added);

      expect(termValues()).toEqual(['iPhone', 'Node.js']);
      expect(component.hasChanges()).toBe(false);
    });
  });

  describe('renaming', () => {
    it('commits an edit and remembers the previous spelling', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;

      component.beginEdit(entry);
      component.onEditDraftChange('iPad');
      component.commitEdit();

      expect(component.editingId()).toBeNull();
      expect(component.termsToSave()).toEqual(['iPad', 'Node.js']);
      expect(entryFor('iPad')?.original).toBe('iPhone');
      expect(component.statusOf(entryFor('iPad') ?? entry)).toBe('edited');
    });

    it('refuses an edit that collides with another term', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;

      component.beginEdit(entry);
      component.onEditDraftChange('Node.js');
      component.commitEdit();

      expect(component.editError()).toBe('Node.js');
      expect(component.editingId()).toBe(entry.id);
      expect(component.termsToSave()).toEqual(['iPhone', 'Node.js']);
    });

    it('treats an emptied edit as a cancel', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;

      component.beginEdit(entry);
      component.onEditDraftChange('   ');
      component.commitEdit();

      expect(component.editingId()).toBeNull();
      expect(component.termsToSave()).toEqual(['iPhone', 'Node.js']);
    });

    it('cancel leaves the term untouched', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;

      component.beginEdit(entry);
      component.onEditDraftChange('iPad');
      component.cancelEdit();

      expect(component.termsToSave()).toEqual(['iPhone', 'Node.js']);
      expect(component.hasChanges()).toBe(false);
    });
  });

  describe('filtering', () => {
    const manyTerms = { ...baseConfig, protectedTerms: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'iPhone'] };

    it('offers no filter on a list short enough to scan', () => {
      render(baseConfig);

      expect(component.showFilter()).toBe(false);
      expect(fixture.nativeElement.querySelector('.terms-filter')).toBeNull();
    });

    it('offers a filter once the list is long enough to need one', () => {
      render(manyTerms);

      expect(component.showFilter()).toBe(true);
      expect(fixture.nativeElement.querySelector('.terms-filter')).not.toBeNull();
    });

    it('drops a filter that would hide a term the user just added', () => {
      render(manyTerms);
      component.filter.set('a1');

      component.onAddDraftChange('Zod');
      component.addTerm();

      expect(component.filter()).toBe('');
      expect(component.visibleEntries().map((entry) => entry.value)).toContain('Zod');
    });

    it('keeps a filter the newly added term still matches', () => {
      render(manyTerms);
      component.filter.set('zo');

      component.onAddDraftChange('Zod');
      component.addTerm();

      expect(component.filter()).toBe('zo');
      expect(component.visibleEntries().map((entry) => entry.value)).toEqual(['Zod']);
    });

    it('drops a filter that would hide a term the user just renamed', () => {
      render(manyTerms);
      component.filter.set('iph');
      const entry = component.visibleEntries()[0];
      expect(entry).toBeDefined();
      if (!entry) return;

      component.beginEdit(entry);
      component.onEditDraftChange('Zod');
      component.commitEdit();

      expect(component.filter()).toBe('');
      expect(component.visibleEntries().map((entry) => entry.value)).toContain('Zod');
    });

    it('matches case-insensitively and reports when nothing matches', () => {
      render(manyTerms);

      component.filter.set('iphone');
      expect(component.visibleEntries().map((entry) => entry.value)).toEqual(['iPhone']);

      component.filter.set('nothing here');
      expect(component.hasNoMatches()).toBe(true);
    });
  });

  describe('saving', () => {
    it('sends the surviving terms in display order', () => {
      render(baseConfig);
      const entry = entryFor('iPhone');
      if (!entry) return;
      component.removeTerm(entry);
      component.onAddDraftChange('C++');
      component.addTerm();

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
      component.removeTerm(entry);
      component.onAddDraftChange('C++');
      component.addTerm();

      component.revertAll();

      expect(component.termsToSave()).toEqual(['iPhone', 'Node.js']);
      expect(component.hasChanges()).toBe(false);
    });

    it('surfaces a failed save error to the user', () => {
      render(null, 'update failed');

      expect(fixture.nativeElement.textContent).toContain('update failed');
    });

    it('does not clobber in-progress edits on a config refetch we did not ask for', () => {
      const config = signal(baseConfig);
      TestBed.overrideProvider(CollectionsStore, {
        useValue: { config, error: signal(null), isLoading: signal(false), updateGlobalConfig: updateGlobalConfigMock },
      });
      fixture = TestBed.createComponent(Settings);
      component = fixture.componentInstance;
      fixture.detectChanges();

      component.onAddDraftChange('C++');
      component.addTerm();
      config.set({ ...baseConfig, protectedTerms: ['iPhone', 'Node.js'] });
      fixture.detectChanges();

      expect(component.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
    });

    it('adopts the refetched config as the new baseline after a save', () => {
      const config = signal(baseConfig);
      TestBed.overrideProvider(CollectionsStore, {
        useValue: { config, error: signal(null), isLoading: signal(false), updateGlobalConfig: updateGlobalConfigMock },
      });
      fixture = TestBed.createComponent(Settings);
      component = fixture.componentInstance;
      fixture.detectChanges();

      component.onAddDraftChange('C++');
      component.addTerm();
      component.save();
      config.set({ ...baseConfig, protectedTerms: ['C++', 'iPhone', 'Node.js'] });
      fixture.detectChanges();

      expect(component.hasChanges()).toBe(false);
      expect(component.termsToSave()).toEqual(['C++', 'iPhone', 'Node.js']);
    });
  });
});
