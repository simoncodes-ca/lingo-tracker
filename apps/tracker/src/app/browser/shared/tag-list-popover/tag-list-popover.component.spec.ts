import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TagListPopover } from './tag-list-popover.component';

describe('TagListPopover', () => {
  let component: TagListPopover;
  let fixture: ComponentFixture<TagListPopover>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagListPopover],
    }).compileComponents();

    fixture = TestBed.createComponent(TagListPopover);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept tags input', () => {
    const tags = ['ui', 'button', 'core'];
    fixture.componentRef.setInput('tags', tags);
    fixture.detectChanges();

    expect(component.tags()).toEqual(tags);
  });

  it('should render tags in template', () => {
    const tags = ['ui', 'button', 'core'];
    fixture.componentRef.setInput('tags', tags);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const tagElements = compiled.querySelectorAll('.tag-badge');

    expect(tagElements.length).toBe(tags.length);
    tags.forEach((tag, index) => {
      expect(tagElements[index].textContent?.trim()).toBe(tag);
    });
  });

  it('should apply host class', () => {
    fixture.detectChanges();

    const hostElement = fixture.nativeElement as HTMLElement;
    expect(hostElement.classList.contains('tag-list-popover-host')).toBe(true);
  });
});
