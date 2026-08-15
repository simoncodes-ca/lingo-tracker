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
    protectedTerms: ['iPhone'],
  };

  const buildStore = (config: LingoTrackerConfigDto | null, error: string | null = null) => ({
    config: signal(config),
    error: signal(error),
    isLoading: signal(false),
    updateGlobalConfig: updateGlobalConfigMock,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [Settings, NoopAnimationsModule, getTranslocoTestingModule()],
      providers: [{ provide: CollectionsStore, useValue: buildStore(null) }],
    }).compileComponents();
  });

  it('renders global protected terms seeded from the store config', async () => {
    TestBed.overrideProvider(CollectionsStore, { useValue: buildStore(baseConfig) });
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.protectedTermsList()).toEqual(['iPhone']);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('iPhone');
  });

  it('save invokes the store updateGlobalConfig with the current terms', () => {
    TestBed.overrideProvider(CollectionsStore, { useValue: buildStore(baseConfig) });
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.addProtectedTerm({ value: 'C++', chipInput: { clear: () => undefined } } as never);
    component.save();

    expect(updateGlobalConfigMock).toHaveBeenCalledWith({ protectedTerms: ['iPhone', 'C++'] });
  });

  it('surfaces a failed save error to the user', () => {
    TestBed.overrideProvider(CollectionsStore, { useValue: buildStore(null, 'update failed') });
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('update failed');
  });

  it('does not clobber in-progress edits on a config refetch', () => {
    const config = signal(baseConfig);
    TestBed.overrideProvider(CollectionsStore, {
      useValue: { config, error: signal(null), isLoading: signal(false), updateGlobalConfig: updateGlobalConfigMock },
    });
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.addProtectedTerm({ value: 'Node.js', chipInput: { clear: () => undefined } } as never);

    // Simulate a successful save's config refetch arriving with the previous terms.
    config.set({ ...baseConfig, protectedTerms: ['iPhone'] });

    expect(component.protectedTermsList()).toEqual(['iPhone', 'Node.js']);
  });
});
