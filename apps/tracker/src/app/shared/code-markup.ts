const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The text wrapped in `<code>`, escaped, so translated prose can set it in mono through `[innerHTML]`. */
export const codeMarkup = (value: string): string => `<code>${escapeHtml(value)}</code>`;

/** The config file name as `<code>` markup, for hints that name it inside translated prose. */
export const CONFIG_FILE_MARKUP = codeMarkup('.lingo-tracker.json');
