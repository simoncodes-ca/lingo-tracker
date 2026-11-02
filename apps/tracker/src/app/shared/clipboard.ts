export type ClipboardOutcome = 'copied' | 'failed';

/** Copies text without choosing the caller's feedback wording or presentation. */
export async function copyToClipboard(text: string): Promise<ClipboardOutcome> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return 'failed';
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Copies once and renders exactly one toast; success effects run only after the write succeeds. */
export async function copyWithFeedback(
  text: string,
  feedback: {
    successMessage: string;
    failedMessage: string;
    notifications: { success(message: string): void; error(message: string): void };
    onCopied?: () => void;
  },
): Promise<ClipboardOutcome> {
  const outcome = await copyToClipboard(text);
  if (outcome === 'copied') {
    feedback.notifications.success(feedback.successMessage);
    feedback.onCopied?.();
  } else {
    feedback.notifications.error(feedback.failedMessage);
  }
  return outcome;
}
