import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationBrowser } from './translation-browser';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';

describe('TranslationBrowser - Integration', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TranslationBrowser,
        getTranslocoTestingModule(),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationBrowser);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display collection name in sidebar header when set', () => {
    // Set collection through the store since collectionName is a computed signal
    component.store.setSelectedCollection({
      collectionName: 'test-collection',
      locales: ['en', 'es'],
    });
    fixture.detectChanges();

    const collectionName = fixture.nativeElement.querySelector('.collection-name');
    expect(collectionName?.textContent).toBe('test-collection');
  });
});
