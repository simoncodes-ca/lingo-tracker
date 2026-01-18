import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { FolderTree } from './folder-tree';

@Pipe({
  name: 'transloco',
  standalone: true,
})
class MockTranslocoPipe implements PipeTransform {
  transform(key: string): string {
    const translations: Record<string, string> = {
      'browser.filterFolders': 'Filter folders...',
      'browser.loadingFolders': 'Loading folders...',
    };
    return translations[key] || key;
  }
}

describe('FolderTree', () => {
  let component: FolderTree;
  let fixture: ComponentFixture<FolderTree>;
  let httpMock: HttpTestingController;
  let mockTransloco: Partial<TranslocoService>;

  beforeEach(async () => {
    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.filterFolders': 'Filter folders...',
          'browser.loadingFolders': 'Loading folders...',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [FolderTree, HttpClientTestingModule],
      providers: [
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(FolderTree, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createComponent(detectChanges = false): void {
    fixture = TestBed.createComponent(FolderTree);
    component = fixture.componentInstance;
    if (detectChanges) {
      fixture.detectChanges();
    }
  }

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('should accept collectionName input', () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');
    expect(component.collectionName()).toBe('my-collection');
  });

  it('should accept disabled input', () => {
    createComponent();
    fixture.componentRef.setInput('disabled', true);
    expect(component.disabled()).toBe(true);
  });

  it('should emit folderSelected when folder is clicked', () => {
    createComponent();
    const emitSpy = vi.fn();
    component.folderSelected.subscribe(emitSpy);

    component.onFolderClick({
      name: 'common',
      fullPath: 'common',
      loaded: false,
    });

    expect(emitSpy).toHaveBeenCalledWith('common');

    // No HTTP call needed for this test
  });

  it('should not load folders on init (delegated to parent)', () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');

    // detectChanges triggers ngOnInit
    fixture.detectChanges();

    // FolderTree no longer loads on init - parent TranslationBrowser handles store initialization
    // Verify no HTTP requests are made
    httpMock.expectNone((request) => {
      return request.url.includes('/api/collections/my-collection/resources/tree');
    });
  });

  it('should render search input', async () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();

    // No HTTP request on init anymore
    // Wait for async operations to complete
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const searchInput = compiled.querySelector('input[type="text"]');

    expect(searchInput).toBeTruthy();
    expect(searchInput?.getAttribute('placeholder')).toBe('Filter folders...');
  });

  it('should debounce search input', async () => {
    vi.useFakeTimers();

    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');

    const setSpy = vi.spyOn(component.store, 'setFolderTreeFilter');

    fixture.detectChanges();

    // No HTTP request on init anymore

    component.onSearchChange('c');
    await vi.advanceTimersByTimeAsync(100);
    expect(setSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(setSpy).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });
});
