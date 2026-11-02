import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { Translate } from './shared';

/** Track loaded translations, including replacements in the same language, inside summary computeds. */
export function injectStripTranslate(): Translate {
  const transloco = inject(TranslocoService);
  const translations = toSignal(transloco.selectTranslation(), { equal: () => false });
  return (token, params) => {
    translations();
    return transloco.translate(token, params);
  };
}
