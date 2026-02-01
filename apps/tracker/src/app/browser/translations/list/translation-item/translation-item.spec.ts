import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationItem } from './translation-item';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';

describe('TranslationItem', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;

  const mockTranslation: ResourceSummaryDto = {
    key: 'common.buttons.save',
    translations: {
      en: 'Save',
      es: 'Guardar',
      fr: 'Enregistrer',
    },
    status: {
      es: 'translated',
      fr: 'verified',
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationItem, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept translation input', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    expect(component.translation()).toEqual(mockTranslation);
  });

  it('should render placeholder for empty selected locale value', () => {
    const t: ResourceSummaryDto = {
      key: 'k-empty',
      translations: { en: 'en', es: '' },
      status: { es: 'new' },
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();

    // In compact mode with non-base locale selected, show that locale's (empty) value
    // The primaryLocaleValue shows the non-base locale's value ('es' which is empty)
    expect(component.primaryLocaleValue()).toBe('');
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('—');
  });

  it('should gracefully handle zero locales selected (compact fallback)', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', []);
    fixture.detectChanges();

    // primaryLocale should fallback to baseLocale
    expect(component.primaryLocale()).toBe(component.baseLocale());
    const html = fixture.nativeElement.innerHTML as string;
    // Should show a helpful message or at least not crash; check presence of key
    expect(html).toContain('common.buttons.save');
  });

  it('rollupStatus should reflect all verified state as verified', () => {
    const t: ResourceSummaryDto = {
      key: 'k-all-verified',
      translations: { en: 'a', es: 'b' },
      status: { en: 'verified', es: 'verified' },
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    const roll = component.rollupStatus();
    expect(roll[0]).toBe('verified');
    expect(roll[1]).toBe(2);
  });

  it('should accept locales input', () => {
    const locales = ['en', 'es', 'fr'];
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', locales);
    fixture.detectChanges();

    expect(component.locales()).toEqual(locales);
  });

  it('should accept baseLocale input with default', () => {
    expect(component.baseLocale()).toBe('en'); // default

    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'de']);
    fixture.componentRef.setInput('baseLocale', 'de');
    fixture.detectChanges();

    expect(component.baseLocale()).toBe('de');
  });
});

describe('TranslationItem - Compact helpers', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;

  const mockTranslation: ResourceSummaryDto = {
    key: 'common.buttons.save',
    translations: {
      en: 'Save',
      es: 'Guardar',
      fr: 'Enregistrer',
    },
    status: {
      es: 'translated',
      fr: 'verified',
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationItem, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
    component = fixture.componentInstance;
  });

  it('should select primary locale from locales input', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
    fixture.detectChanges();

    expect(component.primaryLocale()).toBe('en');
  });

  it('should return selected non-base locale value, or base value when only base is selected', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    // When a non-base locale is in the list alongside base, show non-base value
    expect(component.primaryLocaleValue()).toBe('Guardar');

    // When only a non-base locale is selected, show its value
    fixture.componentRef.setInput('locales', ['es']);
    fixture.detectChanges();
    expect(component.primaryLocaleValue()).toBe('Guardar');

    // When only base locale is selected (or no non-base locales), show base value
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();
    expect(component.primaryLocaleValue()).toBe('Save');
  });

  it('rollupStatus should calculate worst status across all locales', () => {
    const t: ResourceSummaryDto = {
      key: 'k',
      translations: { en: 'a', es: 'b', fr: 'c' },
      status: { en: 'verified', es: 'translated', fr: 'stale' },
    };

    fixture.componentRef.setInput('translation', t);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
    fixture.detectChanges();

    const roll = component.rollupStatus();
    expect(roll[0]).toBe('stale');
    expect(roll[1]).toBe(1);
  });

  it('hasMetadata should be true when tags or comment present, false otherwise', () => {
    const tWithMeta: ResourceSummaryDto = {
      key: 'k',
      translations: { en: 'a' },
      status: {},
      tags: ['ui', 'button'],
      comment: 'Needs review',
    } as any;

    fixture.componentRef.setInput('translation', tWithMeta);
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    expect(component.hasMetadata()).toBe(true);

    const tNoMeta: ResourceSummaryDto = {
      key: 'k2',
      translations: { en: 'b' },
      status: {},
    } as any;

    fixture.componentRef.setInput('translation', tNoMeta);
    fixture.detectChanges();
    expect(component.hasMetadata()).toBe(false);
  });

  it('statusBreakdown should return human readable counts in priority order', () => {
    const t: ResourceSummaryDto = {
      key: 'k3',
      translations: { en: 'a', es: 'b', fr: 'c', de: 'd' },
      status: { en: 'stale', es: 'stale', fr: 'verified', de: 'new' },
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr', 'de']);
    fixture.detectChanges();

    // Expect order: stale, new, translated, verified (only present ones included)
    expect(component.statusBreakdown()).toBe('2 stale, 1 new, 1 verified');
  });
});

// New tests for full density mode expansion logic
describe('TranslationItem - Full density expansion', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationItem, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
  });

  it('needsExpansion should be false for short values', () => {
    const t: ResourceSummaryDto = {
      key: 'k-short',
      translations: { en: 'short', es: 'corto', fr: 'court' },
      status: {},
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.needsExpansion()).toBe(false);
  });

  it('needsExpansion should be true when base long', () => {
    const long = 'a'.repeat(201);
    const t: ResourceSummaryDto = {
      key: 'k-long-base',
      translations: { en: long, es: 'es', fr: 'fr' },
      status: {},
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.needsExpansion()).toBe(true);
  });

  it('needsExpansion should be true when any locale value long', () => {
    const long = 'b'.repeat(205);
    const t: ResourceSummaryDto = {
      key: 'k-long-locale',
      translations: { en: 'en', es: long, fr: 'fr' },
      status: {},
    } as any;

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.needsExpansion()).toBe(true);
  });

  it('isExpanded should toggle when toggleExpansion called', () => {
    fixture.componentRef.setInput('translation', {
      key: 'k',
      translations: { en: 'en' },
      status: {},
    } as any);
    fixture.detectChanges();

    expect(component.isExpanded()).toBe(false);
    component.toggleExpansion();
    expect(component.isExpanded()).toBe(true);
    component.toggleExpansion();
    expect(component.isExpanded()).toBe(false);
  });
});
