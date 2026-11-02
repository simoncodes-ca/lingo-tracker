/**
 * Standardized console output formatting utilities for consistent CLI UX.
 *
 * Provides a centralized way to format success, error, warning, info, and progress
 * messages across all CLI commands.
 *
 * Stdout is the payload, stderr is diagnostics: `error` and `warning` (with their detail
 * lines) write to stderr, so a command whose stdout is piped (`glossary --stdout`,
 * `normalize --json`) keeps it clean. Every other method writes to stdout. This ensures:
 * - Consistent emoji usage and message formatting
 * - Easier to test output format
 * - Single place to change output style globally
 *
 * @example
 * ```typescript
 * import { ConsoleFormatter } from './console-formatter';
 *
 * ConsoleFormatter.success('Resource added successfully');
 * ConsoleFormatter.error('Collection not found');
 * ConsoleFormatter.section('Validation Results');
 * ConsoleFormatter.keyValue('Files Created', 5);
 * ```
 */

import { CommandOutput } from '../runner/command-output';

/** Indents every line of `message` by `level` × 2 spaces. */
function indentLines(message: string, level: number): string {
  const spaces = '  '.repeat(level);
  return message
    .split('\n')
    .map((line) => `${spaces}${line}`)
    .join('\n');
}

/** Writes a diagnostic and its detail lines (indented one level) to stderr. */
function diagnostic(line: string, details: readonly string[]): void {
  CommandOutput.error(line);
  for (const detail of details) {
    CommandOutput.error(indentLines(detail, 1));
  }
}

export const ConsoleFormatter = {
  /**
   * Displays an error message with ❌ prefix, on stderr
   * @param message - Error message to display
   * @param details - Lines printed under it, indented one level (also on stderr)
   */
  error(message: string, details: readonly string[] = []): void {
    diagnostic(`❌ ${message}`, details);
  },

  /**
   * Displays a success message with ✅ prefix
   * @param message - Success message to display
   */
  success(message: string): void {
    CommandOutput.log(`✅ ${message}`);
  },

  /**
   * Displays a warning message with ⚠️ prefix, on stderr
   * @param message - Warning message to display
   * @param details - Lines printed under it, indented one level (also on stderr)
   */
  warning(message: string, details: readonly string[] = []): void {
    diagnostic(`⚠️  ${message}`, details);
  },

  /**
   * Displays an informational message with ℹ️ prefix
   * @param message - Info message to display
   */
  info(message: string): void {
    CommandOutput.log(`ℹ️  ${message}`);
  },

  /**
   * Displays a progress/activity message with 🔄 prefix
   * @param message - Progress message to display
   */
  progress(message: string): void {
    CommandOutput.log(`🔄 ${message}`);
  },

  /**
   * Displays a section header with 📊 prefix and separator line
   * @param title - Section title
   */
  section(title: string): void {
    CommandOutput.log(`\n📊 ${title}`);
    CommandOutput.log('─'.repeat(50));
  },

  /**
   * Displays an indented message
   *
   * A message carrying newlines is indented line by line. A continuation line keeps the
   * indentation of the line it belongs to, rather than landing flush left.
   *
   * @param message - Message to display
   * @param level - Indentation level (default: 1, each level = 2 spaces)
   */
  indent(message: string, level = 1): void {
    CommandOutput.log(indentLines(message, level));
  },

  /**
   * Displays a key-value pair with indentation
   * @param key - Label/key name
   * @param value - Value to display
   * @param indent - Indentation level (default: 1, each level = 2 spaces)
   */
  keyValue(key: string, value: string | number, indent = 1): void {
    const spaces = '  '.repeat(indent);
    CommandOutput.log(`${spaces}${key}: ${value}`);
  },
} as const;
