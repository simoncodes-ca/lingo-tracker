import { describe, it, expect } from 'vitest';
import { ErrorMessages } from './error-messages';

describe('ErrorMessages', () => {
  describe('Configuration Errors', () => {
    it('should provide config not found message', () => {
      expect(ErrorMessages.CONFIG_NOT_FOUND).toBe(
        '❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.'
      );
    });

    it('should provide config invalid message', () => {
      expect(ErrorMessages.CONFIG_INVALID).toBe('❌ Invalid configuration file format.');
    });

    it('should provide config parse failed message', () => {
      const error = 'Unexpected token }';
      expect(ErrorMessages.CONFIG_PARSE_FAILED(error)).toBe(
        `❌ Failed to parse configuration file: ${error}`
      );
    });
  });

  describe('Collection Errors', () => {
    it('should provide collection not found message', () => {
      expect(ErrorMessages.COLLECTION_NOT_FOUND('main')).toBe(
        '❌ Collection "main" not found.'
      );
    });

    it('should provide no collections message', () => {
      expect(ErrorMessages.NO_COLLECTIONS).toBe(
        '❌ No collections found. Run `lingo-tracker add-collection` first.'
      );
    });

    it('should provide collection exists message', () => {
      expect(ErrorMessages.COLLECTION_EXISTS('main')).toBe(
        '❌ Collection "main" already exists.'
      );
    });

    it('should provide no collections available message', () => {
      expect(ErrorMessages.NO_COLLECTIONS_AVAILABLE).toBe('❌ No collections available.');
    });
  });

  describe('Option Errors', () => {
    it('should provide missing single option message', () => {
      expect(ErrorMessages.MISSING_OPTION('collection')).toBe(
        '❌ Missing required option: --collection'
      );
    });

    it('should provide missing multiple options message', () => {
      expect(ErrorMessages.MISSING_OPTIONS(['collection', 'key'])).toBe(
        '❌ Missing required options: --collection, --key'
      );
    });

    it('should provide non-interactive missing options message', () => {
      expect(ErrorMessages.MISSING_OPTIONS_NON_INTERACTIVE(['format', 'output'])).toBe(
        '❌ Missing required options in non-interactive mode: --format, --output'
      );
    });
  });

  describe('Operation Errors', () => {
    it('should provide operation cancelled message', () => {
      expect(ErrorMessages.OPERATION_CANCELLED('Add resource')).toBe(
        '❌ Add resource cancelled.'
      );
    });

    it('should provide operation failed message without reason', () => {
      expect(ErrorMessages.OPERATION_FAILED('Build')).toBe('❌ Build failed.');
    });

    it('should provide operation failed message with reason', () => {
      expect(ErrorMessages.OPERATION_FAILED('Build', 'TypeScript errors')).toBe(
        '❌ Build failed: TypeScript errors'
      );
    });
  });

  describe('Resource Errors', () => {
    it('should provide resource not found message', () => {
      expect(ErrorMessages.RESOURCE_NOT_FOUND('app.button.ok')).toBe(
        '❌ Resource key "app.button.ok" not found.'
      );
    });

    it('should provide resource exists message', () => {
      expect(ErrorMessages.RESOURCE_EXISTS('app.button.ok')).toBe(
        '❌ Resource key "app.button.ok" already exists.'
      );
    });

    it('should provide invalid resource key message', () => {
      expect(ErrorMessages.INVALID_RESOURCE_KEY).toBe('❌ Invalid resource key format.');
    });
  });

  describe('Locale Errors', () => {
    it('should provide locale not found message', () => {
      expect(ErrorMessages.LOCALE_NOT_FOUND('fr')).toBe(
        '❌ Locale "fr" not found in configuration.'
      );
    });

    it('should provide no locales configured message', () => {
      expect(ErrorMessages.NO_LOCALES_CONFIGURED).toBe('❌ No locales configured.');
    });
  });

  describe('File System Errors', () => {
    it('should provide file not found message', () => {
      expect(ErrorMessages.FILE_NOT_FOUND('/path/to/file.json')).toBe(
        '❌ File not found: /path/to/file.json'
      );
    });

    it('should provide directory not found message', () => {
      expect(ErrorMessages.DIRECTORY_NOT_FOUND('/path/to/dir')).toBe(
        '❌ Directory not found: /path/to/dir'
      );
    });

    it('should provide file read failed message without reason', () => {
      expect(ErrorMessages.FILE_READ_FAILED('/path/to/file.json')).toBe(
        '❌ Failed to read file: /path/to/file.json'
      );
    });

    it('should provide file read failed message with reason', () => {
      expect(ErrorMessages.FILE_READ_FAILED('/path/to/file.json', 'Permission denied')).toBe(
        '❌ Failed to read file /path/to/file.json: Permission denied'
      );
    });

    it('should provide file write failed message without reason', () => {
      expect(ErrorMessages.FILE_WRITE_FAILED('/path/to/file.json')).toBe(
        '❌ Failed to write file: /path/to/file.json'
      );
    });

    it('should provide file write failed message with reason', () => {
      expect(ErrorMessages.FILE_WRITE_FAILED('/path/to/file.json', 'Disk full')).toBe(
        '❌ Failed to write file /path/to/file.json: Disk full'
      );
    });
  });
});
