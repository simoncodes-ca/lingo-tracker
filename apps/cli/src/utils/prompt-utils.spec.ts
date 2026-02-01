import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ALL_ITEMS_SENTINEL,
  processMultiselectWithAll,
  multiselectResultToString,
  isInteractiveTerminal,
  executePromptsWithFallback,
} from './prompt-utils';

// Mock prompts module
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

import prompts from 'prompts';

describe('ALL_ITEMS_SENTINEL', () => {
  it('should have the correct sentinel value', () => {
    expect(ALL_ITEMS_SENTINEL).toBe('__ALL__');
  });
});

describe('processMultiselectWithAll', () => {
  const allAvailableItems = ['en', 'fr', 'de', 'es'];

  it('should return selected items when specific items are chosen', () => {
    const result = processMultiselectWithAll(['en', 'fr'], allAvailableItems);
    expect(result).toEqual(['en', 'fr']);
  });

  it('should return undefined when __ALL__ is selected', () => {
    const result = processMultiselectWithAll([ALL_ITEMS_SENTINEL], allAvailableItems);
    expect(result).toBeUndefined();
  });

  it('should return undefined when __ALL__ plus other items are selected (All takes precedence)', () => {
    const result = processMultiselectWithAll([ALL_ITEMS_SENTINEL, 'en', 'fr'], allAvailableItems);
    expect(result).toBeUndefined();
  });

  it('should return undefined when __ALL__ is in the middle of selections', () => {
    const result = processMultiselectWithAll(['en', ALL_ITEMS_SENTINEL, 'fr'], allAvailableItems);
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = processMultiselectWithAll([], allAvailableItems);
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    const result = processMultiselectWithAll(undefined, allAvailableItems);
    expect(result).toBeUndefined();
  });

  it('should return single item in array when one item is selected', () => {
    const result = processMultiselectWithAll(['en'], allAvailableItems);
    expect(result).toEqual(['en']);
  });

  it('should return all items when all are manually selected (no __ALL__)', () => {
    const result = processMultiselectWithAll(['en', 'fr', 'de', 'es'], allAvailableItems);
    expect(result).toEqual(['en', 'fr', 'de', 'es']);
  });

  it('should preserve order of selected items', () => {
    const result = processMultiselectWithAll(['es', 'en', 'de'], allAvailableItems);
    expect(result).toEqual(['es', 'en', 'de']);
  });

  it('should handle empty available items list', () => {
    const result = processMultiselectWithAll(['en', 'fr'], []);
    expect(result).toEqual(['en', 'fr']);
  });

  it('should return undefined when __ALL__ is selected with empty available items', () => {
    const result = processMultiselectWithAll([ALL_ITEMS_SENTINEL], []);
    expect(result).toBeUndefined();
  });
});

describe('multiselectResultToString', () => {
  it('should return undefined for undefined input', () => {
    const result = multiselectResultToString(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = multiselectResultToString([]);
    expect(result).toBeUndefined();
  });

  it('should return single item without comma', () => {
    const result = multiselectResultToString(['en']);
    expect(result).toBe('en');
  });

  it('should return comma-separated string for multiple items', () => {
    const result = multiselectResultToString(['en', 'fr', 'de']);
    expect(result).toBe('en,fr,de');
  });

  it('should preserve order of items', () => {
    const result = multiselectResultToString(['es', 'en', 'de']);
    expect(result).toBe('es,en,de');
  });

  it('should handle items with special characters', () => {
    const result = multiselectResultToString(['en-US', 'fr-FR']);
    expect(result).toBe('en-US,fr-FR');
  });

  it('should handle many items', () => {
    const result = multiselectResultToString(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result).toBe('a,b,c,d,e,f');
  });
});

describe('isInteractiveTerminal', () => {
  let originalStdinIsTTY: boolean | undefined;
  let originalStdoutIsTTY: boolean | undefined;

  beforeEach(() => {
    // Save original values
    originalStdinIsTTY = process.stdin.isTTY;
    originalStdoutIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
  });

  it('should return true when both stdin and stdout are TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(true);
  });

  it('should return false when stdin is not TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(false);
  });

  it('should return false when stdout is not TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(false);
  });

  it('should return false when both stdin and stdout are not TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(false);
  });

  it('should return false when stdin.isTTY is undefined', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(false);
  });

  it('should return false when stdout.isTTY is undefined', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: undefined,
      configurable: true,
    });

    expect(isInteractiveTerminal()).toBe(false);
  });
});

describe('executePromptsWithFallback', () => {
  let originalStdinIsTTY: boolean | undefined;
  let originalStdoutIsTTY: boolean | undefined;

  beforeEach(() => {
    // Save original values
    originalStdinIsTTY = process.stdin.isTTY;
    originalStdoutIsTTY = process.stdout.isTTY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
  });

  describe('when no questions are provided', () => {
    it('should return current values without prompting', async () => {
      const currentValues = { key: 'test', value: 'hello' };
      const result = await executePromptsWithFallback({
        questions: [],
        currentValues,
      });

      expect(result).toEqual(currentValues);
    });
  });

  describe('in interactive mode (TTY)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
    });

    it('should show prompts and merge with current values', async () => {
      const currentValues = { existing: 'value' };
      const promptResponse = { key: 'newkey', value: 'newvalue' };

      vi.mocked(prompts).mockResolvedValue(promptResponse);

      const questions = [
        { type: 'text', name: 'key', message: 'Enter key' },
        { type: 'text', name: 'value', message: 'Enter value' },
      ];

      const result = await executePromptsWithFallback({
        questions,
        currentValues,
      });

      expect(result).toEqual({
        existing: 'value',
        key: 'newkey',
        value: 'newvalue',
      });
    });

    it('should throw error with operation name when cancelled', async () => {
      vi.mocked(prompts).mockImplementation(async (_questions: any, options: any) => {
        options.onCancel();
        return {};
      });

      const questions = [{ type: 'text', name: 'key', message: 'Enter key' }];

      await expect(
        executePromptsWithFallback({
          questions,
          currentValues: {},
          operationName: 'Add resource',
        }),
      ).rejects.toThrow('Add resource cancelled');
    });

    it('should use default operation name when cancelled without operationName', async () => {
      vi.mocked(prompts).mockImplementation(async (_questions: any, options: any) => {
        options.onCancel();
        return {};
      });

      const questions = [{ type: 'text', name: 'key', message: 'Enter key' }];

      await expect(
        executePromptsWithFallback({
          questions,
          currentValues: {},
        }),
      ).rejects.toThrow('Operation cancelled');
    });
  });

  describe('in non-interactive mode (non-TTY)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
    });

    it('should return current values when all required fields are present', async () => {
      const currentValues = { key: 'test', value: 'hello', collection: 'main' };
      const questions = [
        { type: 'text', name: 'key', message: 'Enter key' },
        { type: 'text', name: 'value', message: 'Enter value' },
      ];

      const result = await executePromptsWithFallback({
        questions,
        currentValues,
        requiredFields: ['key', 'value'],
      });

      expect(result).toEqual(currentValues);
    });

    it('should throw error when required fields are missing', async () => {
      const currentValues = { key: 'test' };
      const questions = [
        { type: 'text', name: 'key', message: 'Enter key' },
        { type: 'text', name: 'value', message: 'Enter value' },
      ];

      await expect(
        executePromptsWithFallback({
          questions,
          currentValues,
          requiredFields: ['key', 'value', 'collection'],
        }),
      ).rejects.toThrow('Missing required options in non-interactive mode: --value, --collection');
    });

    it('should throw error listing all missing fields', async () => {
      const currentValues = {};
      const questions = [{ type: 'text', name: 'key', message: 'Enter key' }];

      await expect(
        executePromptsWithFallback({
          questions,
          currentValues,
          requiredFields: ['key', 'value', 'collection'],
        }),
      ).rejects.toThrow('Missing required options in non-interactive mode: --key, --value, --collection');
    });

    it('should return current values when no required fields specified', async () => {
      const currentValues = { key: 'test' };
      const questions = [{ type: 'text', name: 'value', message: 'Enter value' }];

      const result = await executePromptsWithFallback({
        questions,
        currentValues,
      });

      expect(result).toEqual(currentValues);
    });

    it('should handle falsy values correctly (0, empty string)', async () => {
      const currentValues = { count: 0, name: '' };
      const questions = [
        { type: 'number', name: 'count', message: 'Enter count' },
        { type: 'text', name: 'name', message: 'Enter name' },
      ];

      const result = await executePromptsWithFallback({
        questions,
        currentValues,
        requiredFields: ['count', 'name'],
      });

      // Should not throw - empty string and 0 are valid values
      expect(result).toEqual({ count: 0, name: '' });
    });
  });
});
