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
