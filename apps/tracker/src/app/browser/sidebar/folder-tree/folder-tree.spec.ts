import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FolderTree } from './folder-tree';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';

describe('FolderTree', () => {
  let component: FolderTree;
  let fixture: ComponentFixture<FolderTree>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FolderTree, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

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

  describe('setNestedResources — toggle animation', () => {
    beforeEach(() => {
      createComponent();
      fixture.componentRef.setInput('collectionName', 'my-collection');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should immediately set isNestedToggleFlipping to true', () => {
      component.setNestedResources(true);

      expect(component.isNestedToggleFlipping()).toBe(true);
    });

    it('should NOT call store.setNestedResources immediately', () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      component.setNestedResources(true);

      expect(storeSpy).not.toHaveBeenCalled();
    });

    it('should call store.setNestedResources with the correct value at the 125ms midpoint', async () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      component.setNestedResources(true);

      await vi.advanceTimersByTimeAsync(125);

      expect(storeSpy).toHaveBeenCalledWith(true);
    });

    it('should reset isNestedToggleFlipping to false after 250ms', async () => {
      component.setNestedResources(true);

      await vi.advanceTimersByTimeAsync(250);

      expect(component.isNestedToggleFlipping()).toBe(false);
    });

    it('should pass only the second call value to the store on rapid double-click', async () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      // First call — before midpoint, second call cancels it
      component.setNestedResources(true);
      await vi.advanceTimersByTimeAsync(50);

      // Second call overrides the pending mid-timeout
      component.setNestedResources(false);
      await vi.advanceTimersByTimeAsync(125);

      // Only the second call's value should reach the store
      expect(storeSpy).toHaveBeenCalledTimes(1);
      expect(storeSpy).toHaveBeenCalledWith(false);
    });
  });
});
