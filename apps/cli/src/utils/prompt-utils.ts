import prompts from 'prompts';

/**
 * Sentinel value used to represent "all items" in multiselect prompts
 */
export const ALL_ITEMS_SENTINEL = '__ALL__';

/**
 * Processes multiselect prompt results that may include an "All" option.
 *
 * @param selectedValues - Array of selected values from prompt (may include __ALL__)
 * @param allAvailableItems - Complete list of all possible items
 * @returns Array of items to process, or undefined if "All" was selected
 *
 * @example
 * // User selected specific items
 * processMultiselectWithAll(["en", "fr"], ["en", "fr", "de", "es"])
 * // → ["en", "fr"]
 *
 * // User selected "All"
 * processMultiselectWithAll(["__ALL__"], ["en", "fr", "de", "es"])
 * // → undefined (meaning process all)
 *
 * // User selected "All" plus other items (All takes precedence)
 * processMultiselectWithAll(["__ALL__", "en"], ["en", "fr", "de", "es"])
 * // → undefined (meaning process all)
 */
export function processMultiselectWithAll(
  selectedValues: string[] | undefined,
  _allAvailableItems: string[]
): string[] | undefined {
  if (!selectedValues || selectedValues.length === 0) {
    return undefined;
  }

  // If __ALL__ is selected, return undefined to signal "process all"
  if (selectedValues.includes(ALL_ITEMS_SENTINEL)) {
    return undefined;
  }

  // Return selected items
  return selectedValues;
}

/**
 * Converts undefined (all) or array result into comma-separated string or undefined.
 * Useful for storing multiselect results in command options.
 *
 * @example
 * multiselectResultToString(undefined) → undefined
 * multiselectResultToString(["en", "fr"]) → "en,fr"
 * multiselectResultToString([]) → undefined
 */
export function multiselectResultToString(
  items: string[] | undefined
): string | undefined {
  if (!items || items.length === 0) {
    return undefined;
  }
  return items.join(',');
}

/**
 * Checks if the current terminal session is interactive (has both stdin and stdout as TTY).
 * Use this to determine whether to show interactive prompts or require command-line options.
 *
 * @returns true if both stdin and stdout are TTY (interactive terminal)
 *
 * @example
 * if (isInteractiveTerminal()) {
 *   // Show prompts
 * } else {
 *   // Require CLI options
 * }
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Options for executing prompts with automatic fallback to validation in non-interactive mode
 */
export interface PromptExecutionOptions {
  /** Array of prompts to show in interactive mode */
  questions: prompts.PromptObject[];
  /** Current values (from CLI options) */
  currentValues: Record<string, unknown>;
  /** Fields that must be present in non-interactive mode */
  requiredFields?: string[];
  /** Name of the operation for error messages (e.g., "Add resource") */
  operationName?: string;
}

/**
 * Executes prompts in interactive mode or validates required fields in non-interactive mode.
 * Provides consistent behavior across CLI commands for TTY vs non-TTY environments.
 *
 * @param params - Prompt execution configuration
 * @returns Merged values from currentValues and prompt responses
 * @throws Error if operation is cancelled or required fields are missing in non-interactive mode
 *
 * @example
 * const answers = await executePromptsWithFallback({
 *   questions: [
 *     { type: 'text', name: 'key', message: 'Resource key' }
 *   ],
 *   currentValues: options,
 *   requiredFields: ['collection', 'key'],
 *   operationName: 'Add resource'
 * });
 */
export async function executePromptsWithFallback(
  params: PromptExecutionOptions
): Promise<Record<string, unknown>> {
  const { questions, currentValues, requiredFields, operationName } = params;

  // No questions needed - return current values
  if (questions.length === 0) {
    return currentValues;
  }

  // Interactive mode - show prompts
  if (isInteractiveTerminal()) {
    const result = await prompts(questions, {
      onCancel: () => {
        const opName = operationName || 'Operation';
        throw new Error(`${opName} cancelled`);
      }
    });

    return { ...currentValues, ...result };
  }

  // Non-interactive mode - validate required fields
  if (requiredFields) {
    const missing = requiredFields.filter(
      field => currentValues[field] === undefined || currentValues[field] === null
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required options in non-interactive mode: ${missing.map(f => `--${f}`).join(', ')}`
      );
    }
  }

  return currentValues;
}
