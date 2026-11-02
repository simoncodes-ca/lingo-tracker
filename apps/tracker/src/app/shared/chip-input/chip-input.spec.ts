import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ChipInput } from './chip-input';

@Component({
  imports: [ChipInput],
  template: `<input [appChipInput]="chips()" [commitOnBlur]="commitOnBlur()" (chipAdd)="added.push($event)" (chipRemove)="removed.push($event)" />`,
})
class Host {
  readonly chips = signal<readonly string[]>([]);
  readonly commitOnBlur = signal(false);
  readonly added: string[] = [];
  readonly removed: string[] = [];
}

describe('ChipInput', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let input: HTMLInputElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    input.dispatchEvent(event);
    return event;
  }

  function type(text: string): void {
    input.value = text;
  }

  it.each(['Enter', ','])('commits the typed text on %s, clears the field and cancels the key', (key) => {
    type(' Node.js ');
    const event = press(key);
    expect(host.added).toEqual([' Node.js ']);
    expect(input.value).toBe('');
    expect(event.defaultPrevented).toBe(true);
  });

  it('clears blank text and still reports the commit, so the host can reset its own input state', () => {
    type('   ');
    press('Enter');
    expect(host.added).toEqual(['   ']);
    expect(input.value).toBe('');
  });

  it.each(['Enter', ','])('ignores %s while an IME composition is active', (key) => {
    type('にほん');
    const composing = new KeyboardEvent('keydown', { key, isComposing: true, cancelable: true });
    input.dispatchEvent(composing);
    expect(host.added).toEqual([]);
    expect(input.value).toBe('にほん');
    expect(composing.defaultPrevented).toBe(false);
  });

  it('ignores the legacy keyCode 229 composition signal', () => {
    type('にほん');
    const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, cancelable: true });
    input.dispatchEvent(event);
    expect(host.added).toEqual([]);
    expect(input.value).toBe('にほん');
  });

  it('removes the last chip on Backspace in an empty field', () => {
    host.chips.set(['a', 'b']);
    fixture.detectChanges();
    press('Backspace');
    expect(host.removed).toEqual(['b']);
  });

  it('leaves the chips alone on Backspace while text is typed', () => {
    host.chips.set(['a']);
    fixture.detectChanges();
    type('x');
    press('Backspace');
    expect(host.removed).toEqual([]);
  });

  it('does nothing on Backspace with no chips', () => {
    press('Backspace');
    expect(host.removed).toEqual([]);
  });

  it('ignores other keys', () => {
    type('abc');
    press('a');
    expect(host.added).toEqual([]);
    expect(input.value).toBe('abc');
  });

  it('keeps typed text on blur by default', () => {
    type('abc');
    input.dispatchEvent(new Event('blur'));
    expect(host.added).toEqual([]);
    expect(input.value).toBe('abc');
  });

  it('commits typed text on blur when asked to', () => {
    host.commitOnBlur.set(true);
    fixture.detectChanges();
    type('abc');
    input.dispatchEvent(new Event('blur'));
    expect(host.added).toEqual(['abc']);
    expect(input.value).toBe('');
  });
});
