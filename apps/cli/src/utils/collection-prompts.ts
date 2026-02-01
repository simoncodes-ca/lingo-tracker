import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';

/**
 * Prompts user to select a collection, with smart auto-selection behavior.
 *
 * - If value already provided → returns it
 * - If only 1 collection → auto-selects it
 * - If multiple collections → shows prompt (in TTY mode)
 * - If no collections → logs error and returns null
 * - If non-TTY mode without value → throws error
 *
 * @param config - LingoTracker configuration
 * @param currentValue - Already provided collection value (from CLI option)
 * @returns Selected collection name, or null if no collections available
 * @throws Error if required in non-TTY mode without currentValue
 *
 * @example
 * const collection = await promptForCollection(config, options.collection);
 * if (!collection) return;
 */
export async function promptForCollection(
  config: LingoTrackerConfig,
  currentValue?: string,
): Promise<string | null> {
  const collections = Object.keys(config.collections || {});

  // No collections available
  if (collections.length === 0) {
    console.log(
      '❌ No collections found. Run `lingo-tracker add-collection` first.',
    );
    return null;
  }

  // Value already provided
  if (currentValue) {
    return currentValue;
  }

  // Auto-select if only one collection
  if (collections.length === 1) {
    return collections[0];
  }

  // Non-TTY mode requires explicit value
  if (!process.stdout.isTTY) {
    throw new Error('Missing required option: --collection');
  }

  // Show prompt
  const result = await prompts({
    type: 'select',
    name: 'collection',
    message: 'Select collection',
    choices: collections.map((name) => ({ title: name, value: name })),
  });

  return result.collection;
}
