export function parseValidateOptions(options: {
  allowTranslated: boolean;
  skipLocales?: string[];
  skipIcu: boolean;
  skipPlaceholders: boolean;
  requirePortablePlurals: boolean;
}) {
  return {
    allowTranslated: options.allowTranslated,
    skipLocales: options.skipLocales ?? [],
    skipIcu: options.skipIcu,
    skipPlaceholders: options.skipPlaceholders,
    requirePortablePlurals: options.requirePortablePlurals,
  };
}
