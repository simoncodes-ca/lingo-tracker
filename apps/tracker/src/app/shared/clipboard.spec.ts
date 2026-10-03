import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

describe('copyToClipboard', () => {
  it('returns copied only after writing the exact text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyToClipboard('common.buttons.ok')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('common.buttons.ok');
  });

  it('returns failed when the write is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyToClipboard('key')).resolves.toBe('failed');
  });

  it('returns failed when the write throws synchronously', async () => {
    const writeText = vi.fn(() => {
      throw new Error('Denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyToClipboard('key')).resolves.toBe('failed');
  });

  it('returns failed when navigator.clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(copyToClipboard('key')).resolves.toBe('failed');
  });

  it('returns failed when writeText is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
    await expect(copyToClipboard('key')).resolves.toBe('failed');
  });
});
