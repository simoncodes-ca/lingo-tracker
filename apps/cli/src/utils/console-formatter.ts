/**
 * Standardized console output formatting utilities for consistent CLI UX.
 *
 * Provides a centralized way to format success, error, warning, info, and progress
 * messages across all CLI commands. This ensures:
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

export const ConsoleFormatter = {
  /**
   * Displays an error message with ❌ prefix
   * @param message - Error message to display
   */
  error(message: string): void {
    console.log(`❌ ${message}`);
  },

  /**
   * Displays a success message with ✅ prefix
   * @param message - Success message to display
   */
  success(message: string): void {
    console.log(`✅ ${message}`);
  },

  /**
   * Displays a warning message with ⚠️ prefix
   * @param message - Warning message to display
   */
  warning(message: string): void {
    console.log(`⚠️  ${message}`);
  },

  /**
   * Displays an informational message with ℹ️ prefix
   * @param message - Info message to display
   */
  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  },

  /**
   * Displays a progress/activity message with 🔄 prefix
   * @param message - Progress message to display
   */
  progress(message: string): void {
    console.log(`🔄 ${message}`);
  },

  /**
   * Displays a section header with 📊 prefix and separator line
   * @param title - Section title
   */
  section(title: string): void {
    console.log(`\n📊 ${title}`);
    console.log('─'.repeat(50));
  },

  /**
   * Displays an indented message
   * @param message - Message to display
   * @param level - Indentation level (default: 1, each level = 2 spaces)
   */
  indent(message: string, level = 1): void {
    const spaces = '  '.repeat(level);
    console.log(`${spaces}${message}`);
  },

  /**
   * Displays a key-value pair with indentation
   * @param key - Label/key name
   * @param value - Value to display
   * @param indent - Indentation level (default: 1, each level = 2 spaces)
   */
  keyValue(key: string, value: string | number, indent = 1): void {
    const spaces = '  '.repeat(indent);
    console.log(`${spaces}${key}: ${value}`);
  },
} as const;
