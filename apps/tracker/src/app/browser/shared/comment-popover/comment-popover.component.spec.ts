import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CommentPopover } from './comment-popover.component';

describe('CommentPopover', () => {
  let component: CommentPopover;
  let fixture: ComponentFixture<CommentPopover>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommentPopover],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentPopover);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render provided comment', () => {
    fixture.componentRef.setInput('comment', 'Test comment');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const commentText = compiled.querySelector('.comment-text');

    expect(commentText).toBeTruthy();
    expect(commentText?.textContent).toBe('Test comment');
  });

  it('should not render comment text when comment is empty', () => {
    fixture.componentRef.setInput('comment', '');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const commentText = compiled.querySelector('.comment-text');

    expect(commentText).toBeNull();
  });

  it('should not render comment text when comment is undefined', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const commentText = compiled.querySelector('.comment-text');

    expect(commentText).toBeNull();
  });

  it('should accept comment input', () => {
    const testComment = 'This is a test comment';
    fixture.componentRef.setInput('comment', testComment);
    fixture.detectChanges();

    expect(component.comment()).toBe(testComment);
  });

  it('should apply host class', () => {
    fixture.detectChanges();

    const hostElement = fixture.nativeElement as HTMLElement;
    expect(hostElement.classList.contains('comment-popover-host')).toBe(true);
  });
});
