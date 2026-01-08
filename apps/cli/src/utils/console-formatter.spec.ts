import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleFormatter } from './console-formatter';

describe('ConsoleFormatter', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('error', () => {
    it('should format error message with ❌ prefix', () => {
      ConsoleFormatter.error('Something went wrong');
      expect(consoleLogSpy).toHaveBeenCalledWith('❌ Something went wrong');
    });
  });

  describe('success', () => {
    it('should format success message with ✅ prefix', () => {
      ConsoleFormatter.success('Operation completed');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Operation completed');
    });
  });

  describe('warning', () => {
    it('should format warning message with ⚠️ prefix', () => {
      ConsoleFormatter.warning('Be careful');
      expect(consoleLogSpy).toHaveBeenCalledWith('⚠️  Be careful');
    });
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
