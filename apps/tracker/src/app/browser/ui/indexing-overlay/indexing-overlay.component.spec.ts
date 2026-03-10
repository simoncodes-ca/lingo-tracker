import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { By } from '@angular/platform-browser';
import { IndexingOverlay } from './indexing-overlay.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';

describe('IndexingOverlay', () => {
  let component: IndexingOverlay;
  let fixture: ComponentFixture<IndexingOverlay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IndexingOverlay, MatProgressSpinnerModule, MatCardModule, MatButtonModule, getTranslocoTestingModule()],
    }).compileComponents();

    fixture = TestBed.createComponent(IndexingOverlay);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Indexing State', () => {
    it('should display spinner when status is "indexing"', () => {
      fixture.componentRef.setInput('cacheStatus', 'indexing');
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const message = fixture.debugElement.query(By.css('.indexing-message'));

      expect(spinner).toBeTruthy();
      expect(message).toBeTruthy();
      expect(message.nativeElement.textContent).toContain('Indexing collection...');
    });

    it('should display spinner when status is "not-started"', () => {
      fixture.componentRef.setInput('cacheStatus', 'not-started');
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const message = fixture.debugElement.query(By.css('.indexing-message'));

      expect(spinner).toBeTruthy();
      expect(message).toBeTruthy();
      expect(message.nativeElement.textContent).toContain('Indexing collection...');
    });

    it('should display overlay with semi-transparent background when indexing', () => {
      fixture.componentRef.setInput('cacheStatus', 'indexing');
      fixture.detectChanges();

      const overlay = fixture.debugElement.query(By.css('.indexing-overlay'));
      expect(overlay).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('should display error message when status is "error"', () => {
      fixture.componentRef.setInput('cacheStatus', 'error');
      fixture.componentRef.setInput('errorMessage', 'Failed to load resource tree');
      fixture.detectChanges();

      const errorTitle = fixture.debugElement.query(By.css('.error-title'));
      const errorMessage = fixture.debugElement.query(By.css('.error-message'));

      expect(errorTitle).toBeTruthy();
      expect(errorTitle.nativeElement.textContent).toContain('Indexing Failed');
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.nativeElement.textContent).toContain('Failed to load resource tree');
    });

    it('should display default error message when no error message provided', () => {
      fixture.componentRef.setInput('cacheStatus', 'error');
      fixture.componentRef.setInput('errorMessage', null);
      fixture.detectChanges();

      const errorMessage = fixture.debugElement.query(By.css('.error-message'));
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.nativeElement.textContent).toContain('An error occurred while indexing the collection.');
    });

    it('should display retry button when status is "error"', () => {
      fixture.componentRef.setInput('cacheStatus', 'error');
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('button'));
      expect(retryButton).toBeTruthy();
      expect(retryButton.nativeElement.textContent.trim()).toBe('Retry');
    });

    it('should emit retry event when retry button is clicked', () => {
      fixture.componentRef.setInput('cacheStatus', 'error');
      fixture.detectChanges();

      const emitSpy = vi.fn();
      component.retry.subscribe(emitSpy);

      const retryButton = fixture.debugElement.query(By.css('button'));
      retryButton.nativeElement.click();

      expect(emitSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Hidden State', () => {
    it('should hide when status is "ready"', () => {
      fixture.componentRef.setInput('cacheStatus', 'ready');
      fixture.detectChanges();

      const overlay = fixture.debugElement.query(By.css('.indexing-overlay'));
      const spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const errorContent = fixture.debugElement.query(By.css('.error-content'));

      expect(overlay).toBeFalsy();
      expect(spinner).toBeFalsy();
      expect(errorContent).toBeFalsy();
    });

    it('should hide when status is null', () => {
      fixture.componentRef.setInput('cacheStatus', null);
      fixture.detectChanges();

      const overlay = fixture.debugElement.query(By.css('.indexing-overlay'));
      const spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const errorContent = fixture.debugElement.query(By.css('.error-content'));

      expect(overlay).toBeFalsy();
      expect(spinner).toBeFalsy();
      expect(errorContent).toBeFalsy();
    });

    it('should be empty by default (no inputs)', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent?.trim()).toBe('');
    });
  });

  describe('State Transitions', () => {
    it('should transition from indexing to ready correctly', () => {
      // Start with indexing
      fixture.componentRef.setInput('cacheStatus', 'indexing');
      fixture.detectChanges();

      let spinner = fixture.debugElement.query(By.css('mat-spinner'));
      expect(spinner).toBeTruthy();

      // Transition to ready
      fixture.componentRef.setInput('cacheStatus', 'ready');
      fixture.detectChanges();

      spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const overlay = fixture.debugElement.query(By.css('.indexing-overlay'));

      expect(spinner).toBeFalsy();
      expect(overlay).toBeFalsy();
    });

    it('should transition from indexing to error correctly', () => {
      // Start with indexing
      fixture.componentRef.setInput('cacheStatus', 'indexing');
      fixture.detectChanges();

      let spinner = fixture.debugElement.query(By.css('mat-spinner'));
      expect(spinner).toBeTruthy();

      // Transition to error
      fixture.componentRef.setInput('cacheStatus', 'error');
      fixture.componentRef.setInput('errorMessage', 'Test error');
      fixture.detectChanges();

      spinner = fixture.debugElement.query(By.css('mat-spinner'));
      const errorContent = fixture.debugElement.query(By.css('.error-content'));

      expect(spinner).toBeFalsy();
      expect(errorContent).toBeTruthy();
    });
  });
});
