/**
 * Translation orchestrator.
 *
 * Sits between callers and a {@link TranslationProvider}, routing strings to
 * the provider using one of three strategies based on ICU content:
 *
 * 1. **Plain text** (no ICU syntax) — forwarded to the provider unchanged.
 * 2. **Simple placeholders** (`{name}`, `{{ name }}`) — placeholders are
 *    replaced with HTML notranslate markers before sending, then restored from
 *    the translated result. Returns `kind: 'translated-with-placeholders'`.
 * 3. **Complex ICU** (plural, select, number, date, time, or mixed) — returned
 *    unchanged without contacting the provider. Attempting to partially
 *    translate ICU branch content produces incorrect results; human translation
 *    is required.
 *
 * Marker-based placeholder protection also detects when the provider drops or
 * corrupts a marker (count mismatch) and falls back to `kind: 'skipped'` so
 * callers always receive a safe value.
 *
 * @module translation-orchestrator
 */

import { classifyICUContent } from './icu-classifier';
import { protectPlaceholders, restorePlaceholders } from './placeholder-protector';
import type { TranslateRequest, TranslationProvider } from './translation-provider';

/**
 * The result of a single translation attempt.
 *
 * - `kind: 'translated'`                   — plain text was translated by the provider.
 * - `kind: 'translated-with-placeholders'` — simple-placeholder text was translated
 *                                             with marker protection; `value` contains
 *                                             the restored original placeholder syntax.
 * - `kind: 'skipped'`                      — complex ICU syntax or a marker count
 *                                             mismatch; `value` is the unchanged source.
 */
export interface TranslateTextResult {
  readonly kind: 'translated' | 'translated-with-placeholders' | 'skipped';
  readonly value: string;
}

/**
 * Orchestrates translation requests, forwarding strings to the configured
 * {@link TranslationProvider} with the appropriate ICU-aware strategy.
 *
 * Construct with any {@link TranslationProvider} implementation. The
 * orchestrator itself is provider-agnostic — swap providers without
 * changing any caller code.
 *
 * @example
 * ```typescript
 * const provider = createTranslationProvider('google-translate', apiKey);
 * const orchestrator = new TranslationOrchestrator(provider);
 *
 * // Plain text — sent to the provider directly.
 * const plain = await orchestrator.translateText('Hello World', 'en', 'de');
 * // plain.kind === 'translated', plain.value === 'Hallo Welt'
 *
 * // Simple placeholder — translated with marker protection.
 * const simple = await orchestrator.translateText('Hello {name}', 'en', 'de');
 * // simple.kind === 'translated-with-placeholders', simple.value === 'Hallo {name}'
 *
 * // Complex ICU — returned unchanged; requires human translation.
 * const icu = await orchestrator.translateText(
 *   'You have {count, plural, one {# item} other {# items}}',
 *   'en',
 *   'de',
 * );
 * // icu.kind === 'skipped', icu.value === original text
 * ```
 */
export class TranslationOrchestrator {
  readonly #provider: TranslationProvider;

  constructor(provider: TranslationProvider) {
    this.#provider = provider;
  }

  /**
   * Translates a single text string using the ICU-aware strategy.
   *
   * @param text         - Source text, may contain ICU placeholders.
   * @param sourceLocale - BCP 47 locale code of the source text (e.g. `"en"`).
   * @param targetLocale - BCP 47 locale code to translate into (e.g. `"de"`).
   * @returns A {@link TranslateTextResult} describing the outcome.
   * @throws {TranslationError} for any provider-level failure.
   */
  async translateText(text: string, sourceLocale: string, targetLocale: string): Promise<TranslateTextResult> {
    const classification = classifyICUContent(text);

    if (classification === 'complex-icu') {
      return { kind: 'skipped', value: text };
    }

    if (classification === 'plain') {
      const results = await this.#provider.translate([{ text, sourceLocale, targetLocale }]);
      return { kind: 'translated', value: results[0].translatedText };
    }

    // classification === 'simple-placeholders'
    return this.#translateWithPlaceholderProtection(text, sourceLocale, targetLocale);
  }

  /**
   * Translates an array of texts in sequence.
   *
   * Each item is classified independently. Complex ICU items return
   * `kind: 'skipped'`; plain items return `kind: 'translated'`; simple
   * placeholder items return `kind: 'translated-with-placeholders'`.
   *
   * @param items - Array of translation targets.
   * @returns Results in the same order as the input.
   * @throws {TranslationError} on the first item that fails.
   */
  async translateBatch(items: ReadonlyArray<TranslateRequest>): Promise<TranslateTextResult[]> {
    const results: TranslateTextResult[] = [];

    for (const item of items) {
      const result = await this.translateText(item.text, item.sourceLocale, item.targetLocale);
      results.push(result);
    }

    return results;
  }

  /**
   * Translates multiple texts for a single target locale in one provider call.
   *
   * This is the key optimization for bulk locale translation: rather than making
   * one provider call per resource, all translatable texts are collected and sent
   * in a single call (the provider handles its own internal chunking at 128 items).
   *
   * Complex ICU texts are classified and skipped immediately without any API call.
   * Simple-placeholder texts have their placeholders protected before sending and
   * restored from the translated result; a marker mismatch falls back to `kind: 'skipped'`.
   *
   * Results are returned in the same order as the input `texts` array.
   *
   * @param texts        - Array of source strings to translate.
   * @param sourceLocale - BCP 47 locale code of the source texts.
   * @param targetLocale - BCP 47 locale code to translate into.
   * @returns Results in the same order as the input.
   * @throws {TranslationError} for any provider-level failure.
   */
  async translateBatchForLocale(
    texts: string[],
    sourceLocale: string,
    targetLocale: string,
  ): Promise<TranslateTextResult[]> {
    if (texts.length === 0) {
      return [];
    }

    type TextKind = 'plain' | 'simple-placeholders' | 'complex-icu';
    const classifications: TextKind[] = texts.map((text) => classifyICUContent(text));

    // Collect translatable texts (plain + protected simple-placeholder) in one flat array,
    // preserving an index so we can map results back to the original input positions.
    const providerInputs: Array<{ text: string; originalIndex: number }> = [];

    // For simple-placeholder items we need the protect result to restore later.
    const placeholderMaps = new Map<number, ReturnType<typeof protectPlaceholders>['placeholders']>();

    for (let i = 0; i < texts.length; i++) {
      const kind = classifications[i];
      if (kind === 'complex-icu') continue;

      if (kind === 'plain') {
        providerInputs.push({ text: texts[i], originalIndex: i });
      } else {
        // simple-placeholders
        const { protectedText, placeholders } = protectPlaceholders(texts[i]);
        placeholderMaps.set(i, placeholders);
        providerInputs.push({ text: protectedText, originalIndex: i });
      }
    }

    let providerResults: Array<{ translatedText: string }> = [];
    if (providerInputs.length > 0) {
      providerResults = await this.#provider.translate(
        providerInputs.map(({ text }) => ({ text, sourceLocale, targetLocale })),
      );
    }

    const results: TranslateTextResult[] = new Array(texts.length);

    // Fill complex-ICU skips first.
    for (let i = 0; i < texts.length; i++) {
      if (classifications[i] === 'complex-icu') {
        results[i] = { kind: 'skipped', value: texts[i] };
      }
    }

    // Fill translated results.
    for (let providerIdx = 0; providerIdx < providerInputs.length; providerIdx++) {
      const { originalIndex } = providerInputs[providerIdx];
      const translatedText = providerResults[providerIdx].translatedText;
      const kind = classifications[originalIndex];

      if (kind === 'plain') {
        results[originalIndex] = { kind: 'translated', value: translatedText };
      } else {
        // simple-placeholders — restore markers
        const placeholders = placeholderMaps.get(originalIndex);
        if (!placeholders) {
          results[originalIndex] = { kind: 'skipped', value: texts[originalIndex] };
          continue;
        }
        const restoreResult = restorePlaceholders(translatedText, placeholders);
        if (!restoreResult.success) {
          results[originalIndex] = { kind: 'skipped', value: texts[originalIndex] };
        } else {
          results[originalIndex] = { kind: 'translated-with-placeholders', value: restoreResult.value };
        }
      }
    }

    return results;
  }

  /**
   * Protects simple placeholders with markers, translates the protected text,
   * then restores the original placeholder syntax.
   *
   * Falls back to `kind: 'skipped'` when the provider drops or corrupts a
   * marker, preserving a valid value for the caller.
   *
   * @param text         - Source text containing only simple ICU placeholders.
   * @param sourceLocale - BCP 47 source locale.
   * @param targetLocale - BCP 47 target locale.
   * @returns Translated result or a skip signal on marker mismatch.
   */
  async #translateWithPlaceholderProtection(
    text: string,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<TranslateTextResult> {
    const { protectedText, placeholders } = protectPlaceholders(text);

    const results = await this.#provider.translate([{ text: protectedText, sourceLocale, targetLocale }]);
    const translatedText = results[0].translatedText;

    const restoreResult = restorePlaceholders(translatedText, placeholders);

    if (!restoreResult.success) {
      return { kind: 'skipped', value: text };
    }

    return { kind: 'translated-with-placeholders', value: restoreResult.value };
  }
}
