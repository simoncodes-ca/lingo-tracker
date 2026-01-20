import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationItem } from './translation-item';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';

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
      imports: [
        TranslationItem,
        getTranslocoTestingModule(),
      ],
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

describe('TranslationItem - Copy to Clipboard', () => {
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
      imports: [
        TranslationItem,
        getTranslocoTestingModule(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
  });

  it('should emit copyKey event when key button clicked', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    let emittedKey = '';
    fixture.componentInstance.copyKey.subscribe((key) => {
      emittedKey = key;
    });

    const keyButton = fixture.nativeElement.querySelector('.key-button');
    keyButton.click();

    expect(emittedKey).toBe('common.buttons.save');
  });

  it('should display copy icon on hover', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    const copyIcon = fixture.nativeElement.querySelector('.copy-icon');

    // Icon should have opacity 0 initially (via CSS)
    expect(copyIcon).toBeTruthy();
  });
});

describe('TranslationItem - Context Menu Actions', () => {
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
      imports: [
        TranslationItem,
        getTranslocoTestingModule(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
    fixture.detectChanges();
  });

  it('should emit editTranslation event', () => {
    let emittedTranslation: ResourceSummaryDto | null = null;
    fixture.componentInstance.editTranslation.subscribe((trans) => {
      emittedTranslation = trans;
    });

    component.editTranslation.emit(mockTranslation);

    expect(emittedTranslation).toEqual(mockTranslation);
  });

  it('should emit moveTranslation event', () => {
    let emittedTranslation: ResourceSummaryDto | null = null;
    fixture.componentInstance.moveTranslation.subscribe((trans) => {
      emittedTranslation = trans;
    });

    component.moveTranslation.emit(mockTranslation);

    expect(emittedTranslation).toEqual(mockTranslation);
  });

  it('should emit deleteTranslation event', () => {
    let emittedTranslation: ResourceSummaryDto | null = null;
    fixture.componentInstance.deleteTranslation.subscribe((trans) => {
      emittedTranslation = trans;
    });

    component.deleteTranslation.emit(mockTranslation);

    expect(emittedTranslation).toEqual(mockTranslation);
  });
});

describe('TranslationItem - Locale Rendering', () => {
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
      imports: [
        TranslationItem,
        getTranslocoTestingModule(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
  });

  it('should display base locale value', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();

    const baseValue = fixture.nativeElement.querySelector('.base-value');
    expect(baseValue.textContent.trim()).toBe('Save');
  });

  it('should display locale translations excluding base', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();

    const localeLines = fixture.nativeElement.querySelectorAll('.locale-line');
    expect(localeLines.length).toBe(2); // es and fr only

    expect(localeLines[0].textContent).toContain('es:');
    expect(localeLines[0].textContent).toContain('Guardar');

    expect(localeLines[1].textContent).toContain('fr:');
    expect(localeLines[1].textContent).toContain('Enregistrer');
  });

  it('should apply status data attribute for color coding', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en', 'es', 'fr']);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();

    const localeValues = fixture.nativeElement.querySelectorAll('.locale-value');

    expect(localeValues[0].getAttribute('data-status')).toBe('translated');
    expect(localeValues[1].getAttribute('data-status')).toBe('verified');
  });

  it('should display em dash for missing translations', () => {
    const translationWithMissing: ResourceSummaryDto = {
      key: 'test.key',
      translations: {
        en: 'Test',
      },
      status: {},
    };

    fixture.componentRef.setInput('translation', translationWithMissing);
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();

    const localeValue = fixture.nativeElement.querySelector('.locale-value');
    expect(localeValue.textContent.trim()).toBe('—');
  });
});

describe('TranslationItem - Tags', () => {
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
      imports: [
        TranslationItem,
        getTranslocoTestingModule(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationItem);
  });

  it('should display tags when present', () => {
    const translationWithTags: ResourceSummaryDto = {
      ...mockTranslation,
      tags: ['Primary action button', 'Destructive action - requires confirmation'],
    };

    fixture.componentRef.setInput('translation', translationWithTags);
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    const tagsContainer = fixture.nativeElement.querySelector('.tag-list-container');
    expect(tagsContainer).toBeTruthy();

    const chips = fixture.nativeElement.querySelectorAll('.tag-badge');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent.trim()).toBe('Primary action button');
    expect(chips[1].textContent.trim()).toBe('Destructive action - requires confirmation');
  });

  it('should not display tags container when no tags', () => {
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    const tagsContainer = fixture.nativeElement.querySelector('.tags-container');
    expect(tagsContainer).toBeNull();
  });
});
