import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, copyWithFeedback } from './clipboard';

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

describe('copyWithFeedback', () => {
  it('shows success and runs the success effect only after the clipboard accepts the text', async () => {
    let accept: (() => void) | undefined;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const notifications = { success: vi.fn(), error: vi.fn() };
    const onCopied = vi.fn();
    const pending = copyWithFeedback('full.key', {
      notifications,
      successMessage: 'Copied',
      failedMessage: 'Refused',
      onCopied,
    });
    expect(notifications.success).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
    accept?.();
    await expect(pending).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('full.key');
    expect(notifications.success).toHaveBeenCalledExactlyOnceWith('Copied');
    expect(notifications.error).not.toHaveBeenCalled();
    expect(onCopied).toHaveBeenCalledOnce();
  });

  it('shows the caller failure message and does not run success effects on refusal', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
      configurable: true,
    });
    const notifications = { success: vi.fn(), error: vi.fn() };
    const onCopied = vi.fn();
    await expect(
      copyWithFeedback('key', {
        notifications,
        successMessage: 'Copied',
        failedMessage: 'Refused',
        onCopied,
      }),
    ).resolves.toBe('failed');
    expect(notifications.error).toHaveBeenCalledExactlyOnceWith('Refused');
    expect(notifications.success).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });
});
