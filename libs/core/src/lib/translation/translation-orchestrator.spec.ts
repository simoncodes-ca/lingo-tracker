import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationOrchestrator } from './translation-orchestrator';
import { TranslationError } from './translation-provider';
import type { TranslationProvider, TranslateRequest, TranslateResult } from './translation-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock TranslationProvider whose `translate` implementation is a
 * plain vi.fn(). Callers can configure return values per-test with
 * `mockResolvedValue` / `mockResolvedValueOnce`.
 */
function makeProvider(): TranslationProvider & { translate: ReturnType<typeof vi.fn> } {
  return {
    translate: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue({
      supportsBatch: true,
      maxBatchSize: 128,
      supportsFormality: false,
    }),
  };
}

/**
 * Builds a minimal TranslateResult for a translated string.
 */
function makeResult(translatedText: string): TranslateResult {
  return { translatedText, provider: 'mock' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranslationOrchestrator', () => {
  let provider: ReturnType<typeof makeProvider>;
  let orchestrator: TranslationOrchestrator;

  beforeEach(() => {
    provider = makeProvider();
    orchestrator = new TranslationOrchestrator(provider);
  });

  // -------------------------------------------------------------------------
  // translateText — plain text (no ICU)
  // -------------------------------------------------------------------------

  describe('translateText — plain text (no ICU placeholders)', () => {
    it('returns kind: translated with the provider result', async () => {
      provider.translate.mockResolvedValue([makeResult('Hallo Welt')]);

      const result = await orchestrator.translateText('Hello World', 'en', 'de');

      expect(result).toEqual({ kind: 'translated', value: 'Hallo Welt' });
      expect(provider.translate).toHaveBeenCalledOnce();
      expect(provider.translate).toHaveBeenCalledWith([
        { text: 'Hello World', sourceLocale: 'en', targetLocale: 'de' },
      ]);
    });

    it('forwards an empty string to the provider', async () => {
      provider.translate.mockResolvedValue([makeResult('')]);

      const result = await orchestrator.translateText('', 'en', 'de');

      expect(result).toEqual({ kind: 'translated', value: '' });
      expect(provider.translate).toHaveBeenCalledWith([{ text: '', sourceLocale: 'en', targetLocale: 'de' }]);
    });
  });

  // -------------------------------------------------------------------------
  // translateText — complex ICU (skipped, returned as-is)
  // -------------------------------------------------------------------------

  describe('translateText — complex ICU placeholders', () => {
    it('returns kind: skipped without calling the provider for a plural block', async () => {
      const input = 'You have {count, plural, one {# item} other {# items}} in cart';

      const result = await orchestrator.translateText(input, 'en', 'de');

      expect(result).toEqual({ kind: 'skipped', value: input });
      expect(provider.translate).not.toHaveBeenCalled();
    });

    it('returns kind: skipped without calling the provider for a standalone plural block', async () => {
      const input = '{count, plural, one {# item} other {# items}}';

      const result = await orchestrator.translateText(input, 'en', 'de');

      expect(result).toEqual({ kind: 'skipped', value: input });
      expect(provider.translate).not.toHaveBeenCalled();
    });

    it('returns kind: skipped without calling the provider for a select block', async () => {
      const input = '{gender, select, male {he} female {she} other {they}}';

      const result = await orchestrator.translateText(input, 'en', 'de');

      expect(result).toEqual({ kind: 'skipped', value: input });
      expect(provider.translate).not.toHaveBeenCalled();
    });

    it('returns kind: skipped for mixed simple + complex ICU without calling the provider', async () => {
      const input = 'Hello {name}, {count, plural, one {# item} other {# items}}';

      const result = await orchestrator.translateText(input, 'en', 'de');

      expect(result).toEqual({ kind: 'skipped', value: input });
      expect(provider.translate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // translateText — simple placeholders (marker-based translation)
  // -------------------------------------------------------------------------

  describe('translateText — simple ICU placeholders', () => {
    it('returns kind: translated-with-placeholders for a single {name} placeholder', async () => {
      // The provider receives the marker-protected text and returns a translated
      // version with the marker still present.
      provider.translate.mockImplementation(async (requests: TranslateRequest[]) => {
        // Simulate provider translating surrounding text but leaving span intact.
        const translated = requests[0].text.replace('Hello', 'Hallo');
        return [makeResult(translated)];
      });

      const result = await orchestrator.translateText('Hello {name}', 'en', 'de');

      expect(result.kind).toBe('translated-with-placeholders');
      expect(result.value).toBe('Hallo {name}');
      expect(provider.translate).toHaveBeenCalledOnce();
    });

    it('returns kind: translated-with-placeholders for a Transloco {{ name }} placeholder', async () => {
      provider.translate.mockImplementation(async (requests: TranslateRequest[]) => {
        const translated = requests[0].text.replace('Hello', 'Hallo');
        return [makeResult(translated)];
      });

      const result = await orchestrator.translateText('Hello {{ name }}', 'en', 'de');

      expect(result.kind).toBe('translated-with-placeholders');
      expect(result.value).toBe('Hallo {{ name }}');
    });

    it('restores multiple placeholders after translation', async () => {
      provider.translate.mockImplementation(async (requests: TranslateRequest[]) => {
        // Translate the surrounding text while preserving spans.
        const translated = requests[0].text.replace('File', 'Datei').replace('is newer than', 'ist neuer als');
        return [makeResult(translated)];
      });

      const result = await orchestrator.translateText('File {fileA} is newer than {fileB}', 'en', 'de');

      expect(result.kind).toBe('translated-with-placeholders');
      expect(result.value).toBe('Datei {fileA} ist neuer als {fileB}');
    });

    it('sends the marker-protected text (with span wrappers) to the provider', async () => {
      provider.translate.mockImplementation(async (requests: TranslateRequest[]) => {
        return [makeResult(requests[0].text)]; // echo back unchanged
      });

      await orchestrator.translateText('Hello {name}', 'en', 'de');

      const sentText: string = provider.translate.mock.calls[0][0][0].text;
      expect(sentText).toContain('<span class="notranslate">__PH0__</span>');
      expect(sentText).not.toContain('{name}');
    });

    it('returns kind: skipped when the provider drops a placeholder marker', async () => {
      // Provider strips the span / marker entirely.
      provider.translate.mockResolvedValue([makeResult('Hallo')]);

      const result = await orchestrator.translateText('Hello {name}', 'en', 'de');

      expect(result).toEqual({ kind: 'skipped', value: 'Hello {name}' });
    });

    it('returns the original source text (not the provider result) when a marker is dropped', async () => {
      provider.translate.mockResolvedValue([makeResult('some corrupted output')]);

      const input = 'Hello {name}';
      const result = await orchestrator.translateText(input, 'en', 'de');

      // Must fall back to the original, not the corrupted provider output.
      expect(result.value).toBe(input);
    });
  });

  // -------------------------------------------------------------------------
  // translateText — provider error propagation
  // -------------------------------------------------------------------------

  describe('translateText — provider error propagation', () => {
    it('re-throws TranslationError from the provider unchanged', async () => {
      const providerError = new TranslationError('quota exceeded', 'RATE_LIMIT', true);
      provider.translate.mockRejectedValue(providerError);

      await expect(orchestrator.translateText('Hello', 'en', 'de')).rejects.toBe(providerError);
    });

    it('re-throws unexpected errors from the provider unchanged', async () => {
      const networkError = new Error('ECONNRESET');
      provider.translate.mockRejectedValue(networkError);

      await expect(orchestrator.translateText('Hello', 'en', 'de')).rejects.toBe(networkError);
    });

    it('re-throws provider errors for simple-placeholder strings', async () => {
      const providerError = new TranslationError('quota exceeded', 'RATE_LIMIT', true);
      provider.translate.mockRejectedValue(providerError);

      await expect(orchestrator.translateText('Hello {name}', 'en', 'de')).rejects.toBe(providerError);
    });
  });

  // -------------------------------------------------------------------------
  // translateBatch
  // -------------------------------------------------------------------------

  describe('translateBatch', () => {
    it('returns translations in the same order as the input items', async () => {
      provider.translate.mockResolvedValueOnce([makeResult('Hallo')]).mockResolvedValueOnce([makeResult('Tschüss')]);

      const results = await orchestrator.translateBatch([
        { text: 'Hello', sourceLocale: 'en', targetLocale: 'de' },
        { text: 'Goodbye', sourceLocale: 'en', targetLocale: 'de' },
      ]);

      expect(results).toEqual([
        { kind: 'translated', value: 'Hallo' },
        { kind: 'translated', value: 'Tschüss' },
      ]);
    });

    it('returns kind: skipped for complex ICU items without calling the provider', async () => {
      const results = await orchestrator.translateBatch([
        { text: '{count, plural, one {# item} other {# items}}', sourceLocale: 'en', targetLocale: 'de' },
        { text: '{gender, select, male {he} female {she} other {they}}', sourceLocale: 'en', targetLocale: 'de' },
      ]);

      expect(results[0].kind).toBe('skipped');
      expect(results[1].kind).toBe('skipped');
      expect(provider.translate).not.toHaveBeenCalled();
    });

    it('returns kind: translated-with-placeholders for simple-placeholder items', async () => {
      // Provider echoes text back unchanged (markers survive).
      provider.translate.mockImplementation(async (requests: TranslateRequest[]) => [makeResult(requests[0].text)]);

      const results = await orchestrator.translateBatch([
        { text: 'Hello {name}', sourceLocale: 'en', targetLocale: 'de' },
      ]);

      expect(results[0].kind).toBe('translated-with-placeholders');
    });

    it('returns an empty array for an empty input', async () => {
      const results = await orchestrator.translateBatch([]);

      expect(results).toEqual([]);
      expect(provider.translate).not.toHaveBeenCalled();
    });

    it('processes items sequentially and stops on first failure', async () => {
      const providerError = new TranslationError('fail', 'SERVER_ERROR', true);
      provider.translate.mockResolvedValueOnce([makeResult('Hallo')]).mockRejectedValueOnce(providerError);

      await expect(
        orchestrator.translateBatch([
          { text: 'Hello', sourceLocale: 'en', targetLocale: 'de' },
          { text: 'World', sourceLocale: 'en', targetLocale: 'de' },
        ]),
      ).rejects.toBe(providerError);

      expect(provider.translate).toHaveBeenCalledTimes(2);
    });

    it('translates plain-text items and returns complex ICU items as skipped in a mixed batch (plain first)', async () => {
      provider.translate.mockResolvedValueOnce([makeResult('Hallo Welt')]);

      const results = await orchestrator.translateBatch([
        { text: 'Hello World', sourceLocale: 'en', targetLocale: 'de' },
        { text: '{count, plural, one {# item} other {# items}}', sourceLocale: 'en', targetLocale: 'de' },
      ]);

      expect(results[0]).toEqual({ kind: 'translated', value: 'Hallo Welt' });
      expect(results[1].kind).toBe('skipped');
      // Provider is called once for the plain-text item only.
      expect(provider.translate).toHaveBeenCalledOnce();
    });

    it('returns complex ICU items as skipped and translates plain-text items in a mixed batch (ICU first)', async () => {
      provider.translate.mockResolvedValueOnce([makeResult('Hallo Welt')]);

      const results = await orchestrator.translateBatch([
        { text: '{count, plural, one {# item} other {# items}}', sourceLocale: 'en', targetLocale: 'de' },
        { text: 'Hello World', sourceLocale: 'en', targetLocale: 'de' },
      ]);

      expect(results[0].kind).toBe('skipped');
      expect(results[1]).toEqual({ kind: 'translated', value: 'Hallo Welt' });
      expect(provider.translate).toHaveBeenCalledOnce();
    });
  });
});
