import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleFormatter } from './console-formatter';

describe('ConsoleFormatter', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('error', () => {
    it('should format error message with ❌ prefix on stderr', () => {
      ConsoleFormatter.error('Something went wrong');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Something went wrong');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('prints its detail lines under it, indented, on stderr', () => {
      ConsoleFormatter.error('Errors (2):', ['- first', 'second\ncontinued']);
      expect(consoleErrorSpy.mock.calls).toEqual([['❌ Errors (2):'], ['  - first'], ['  second\n  continued']]);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should format success message with ✅ prefix', () => {
      ConsoleFormatter.success('Operation completed');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Operation completed');
    });
  });

  describe('warning', () => {
    it('should format warning message with ⚠️ prefix on stderr', () => {
      ConsoleFormatter.warning('Be careful');
      expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  Be careful');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('prints its detail lines under it, indented, on stderr', () => {
      ConsoleFormatter.warning('Warnings (1):', ['- one']);
      expect(consoleErrorSpy.mock.calls).toEqual([['⚠️  Warnings (1):'], ['  - one']]);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  it('writes success, info, progress, section, indent and keyValue to stdout only', () => {
    ConsoleFormatter.success('s');
    ConsoleFormatter.info('i');
    ConsoleFormatter.progress('p');
    ConsoleFormatter.section('t');
    ConsoleFormatter.indent('x');
    ConsoleFormatter.keyValue('k', 1);
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  describe('info', () => {
    it('should format info message with ℹ️ prefix', () => {
      ConsoleFormatter.info('Here is some info');
      expect(consoleLogSpy).toHaveBeenCalledWith('ℹ️  Here is some info');
    });
  });

  describe('progress', () => {
    it('should format progress message with 🔄 prefix', () => {
      ConsoleFormatter.progress('Processing...');
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Processing...');
    });
  });

  describe('section', () => {
    it('should format section header with newline, 📊 prefix, and separator', () => {
      ConsoleFormatter.section('Summary');
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '\n📊 Summary');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '─'.repeat(50));
    });
  });

  describe('indent', () => {
    it('should indent message with default level (1)', () => {
      ConsoleFormatter.indent('Indented message');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Indented message');
    });

    it('should indent message with custom level', () => {
      ConsoleFormatter.indent('Deeply indented', 3);
      expect(consoleLogSpy).toHaveBeenCalledWith('      Deeply indented');
    });

    it('should not indent with level 0', () => {
      ConsoleFormatter.indent('Not indented', 0);
      expect(consoleLogSpy).toHaveBeenCalledWith('Not indented');
    });

    it('should indent every line of a multi-line message', () => {
      ConsoleFormatter.indent('First line\nsecond line', 2);
      expect(consoleLogSpy).toHaveBeenCalledWith('    First line\n    second line');
    });
  });

  describe('keyValue', () => {
    it('should format key-value pair with default indent', () => {
      ConsoleFormatter.keyValue('Files Created', 5);
      expect(consoleLogSpy).toHaveBeenCalledWith('  Files Created: 5');
    });

    it('should format key-value pair with string value', () => {
      ConsoleFormatter.keyValue('Status', 'Success');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Status: Success');
    });

    it('should format key-value pair with custom indent', () => {
      ConsoleFormatter.keyValue('Count', 42, 2);
      expect(consoleLogSpy).toHaveBeenCalledWith('    Count: 42');
    });

    it('should format key-value pair with no indent', () => {
      ConsoleFormatter.keyValue('Total', 100, 0);
      expect(consoleLogSpy).toHaveBeenCalledWith('Total: 100');
    });
  });
});
