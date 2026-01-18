import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { TranslationBrowser } from './translation-browser';
import { FolderTree } from './folder-tree/folder-tree';
import { TranslationList } from './translation-list';
import { FolderNode } from './folder-tree/folder-node/folder-node';
import { TranslationItem } from './translation-item';

@Pipe({
  name: 'transloco',
  standalone: true,
})
class MockTranslocoPipe implements PipeTransform {
  transform(key: string): string {
    const translations: Record<string, string> = {
      'browser.filterFolders': 'Filter folders...',
      'browser.loadingFolders': 'Loading folders...',
      'browser.loadingTranslations': 'Loading translations...',
      'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
      'browser.clickToLoad': 'click to load',
      'common.actions.clickToCopy': 'click to copy',
      'common.actions.edit': 'Edit',
      'common.actions.move': 'Move',
      'common.actions.delete': 'Delete',
    };
    return translations[key] || key;
  }
}

describe('TranslationBrowser - Integration', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;
  let mockTransloco: Partial<TranslocoService>;

  beforeEach(async () => {
    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.filterFolders': 'Filter folders...',
          'browser.loadingFolders': 'Loading folders...',
          'browser.loadingTranslations': 'Loading translations...',
          'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
          'browser.clickToLoad': 'click to load',
          'common.actions.clickToCopy': 'click to copy',
          'common.actions.edit': 'Edit',
          'common.actions.move': 'Move',
          'common.actions.delete': 'Delete',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [TranslationBrowser],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(TranslationBrowser, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .overrideComponent(FolderTree, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .overrideComponent(TranslationList, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .overrideComponent(FolderNode, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .overrideComponent(TranslationItem, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(TranslationBrowser);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display collection name in header when set', () => {
    // Set collection through the store since collectionName is a computed signal
    component.store.setSelectedCollection({
      collectionName: 'test-collection',
      locales: ['en', 'es'],
    });
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('h1');
    expect(header.textContent).toBe('test-collection');
  });
});
