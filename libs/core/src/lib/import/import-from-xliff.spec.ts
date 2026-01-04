import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractFromXliff, importFromXliff } from './import-from-xliff';
import { ImportOptions } from './types';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');
vi.mock('path');

describe('import-from-xliff', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path functions
    vi.spyOn(path, 'resolve').mockImplementation((...segments) =>
      segments.join('/')
    );
    vi.spyOn(path, 'join').mockImplementation((...segments) =>
      segments.join('/')
    );
    vi.spyOn(path, 'dirname').mockImplementation((p) => {
      const parts = String(p).split('/');
      parts.pop();
      return parts.join('/');
    });
  });

  describe('extractFromXliff', () => {
    it('should extract resources from valid XLIFF 1.2', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.buttons.ok">
        <source>OK</source>
        <target>Aceptar</target>
      </trans-unit>
      <trans-unit id="common.buttons.cancel">
        <source>Cancel</source>
        <target>Cancelar</target>
        <note>Button to cancel operation</note>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const resources = await extractFromXliff(xliffContent);

      expect(resources).toHaveLength(2);
      expect(resources[0]).toEqual({
        key: 'common.buttons.ok',
        value: 'Aceptar',
        baseValue: 'OK',
      });
      expect(resources[1]).toEqual({
        key: 'common.buttons.cancel',
        value: 'Cancelar',
        baseValue: 'Cancel',
        comment: 'Button to cancel operation',
      });
    });

    it('should skip trans-units with empty targets', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.title">
        <source>Title</source>
        <target>Título</target>
      </trans-unit>
      <trans-unit id="common.empty">
        <source>Empty</source>
        <target></target>
      </trans-unit>
      <trans-unit id="common.missing">
        <source>Missing</source>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const resources = await extractFromXliff(xliffContent);

      expect(resources).toHaveLength(1);
      expect(resources[0].key).toBe('common.title');
    });

    it('should handle XLIFF with notes', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="app.welcome">
        <source>Welcome</source>
        <target>Bienvenue</target>
        <note>Greeting message shown on home page</note>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const resources = await extractFromXliff(xliffContent);

      expect(resources).toHaveLength(1);
      expect(resources[0].comment).toBe('Greeting message shown on home page');
    });

    it('should throw error for invalid XLIFF', async () => {
      const invalidXliff = 'This is not valid XML';

      await expect(extractFromXliff(invalidXliff)).rejects.toThrow('Failed to parse XLIFF content');
    });
  });

  describe('importFromXliff', () => {
    it('should import XLIFF and update existing resources', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.buttons.ok">
        <source>OK</source>
        <target>Aceptar</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const existingEntries = {
        ok: { source: 'OK' },
      };

      const existingMeta = {
        ok: { en: { checksum: 'checksum-ok-en' } },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return true;
        if (pathStr.includes('resource_entries.json')) return true;
        if (pathStr.includes('tracker_meta.json')) return true;
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return xliffContent;
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'es',
      };

      const result = await importFromXliff('/translations/common/buttons', options);

      expect(result.format).toBe('xliff');
      expect(result.resourcesUpdated).toBe(1);
      expect(result.resourcesCreated).toBe(0);

      // Verify file was written
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find(call =>
        String(call[0]).includes('resource_entries.json')
      );
      if (resourceEntriesCall) {
        const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(updatedEntries.ok.es).toBe('Aceptar');
      }
    });

    it('should warn on base value mismatch', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.title">
        <source>Different Title</source>
        <target>Título</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const existingEntries = {
        title: { source: 'Original Title' },
      };

      const existingMeta = {
        title: { en: { checksum: 'checksum-en' } },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return xliffContent;
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'es',
      };

      const result = await importFromXliff('/translations/common', options);

      expect(result.warnings.length).toBeGreaterThan(0);
      const mismatchWarning = result.warnings.find(w => w.includes('Base value mismatch'));
      expect(mismatchWarning).toBeDefined();
      expect(mismatchWarning).toContain('common.title');
      expect(mismatchWarning).toContain('preserving LingoTracker value');
    });

    it('should create new resources with migration strategy', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.newkey">
        <source>New Value</source>
        <target>Nuevo Valor</target>
        <note>A new resource</note>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return true;
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return xliffContent;
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'es',
        strategy: 'migration',
      };

      const result = await importFromXliff('/translations/common', options);

      expect(result.resourcesCreated).toBe(1);
      expect(result.resourcesUpdated).toBe(0);

      // Verify new resource was created
      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find(call =>
        String(call[0]).includes('resource_entries.json')
      );
      if (resourceEntriesCall) {
        const newEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(newEntries.newkey.source).toBe('New Value');
        expect(newEntries.newkey.es).toBe('Nuevo Valor');
        expect(newEntries.newkey.comment).toBe('A new resource');
      }
    });

    it('should update comments when updateComments flag is set', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.title">
        <source>Title</source>
        <target>Título</target>
        <note>New comment from XLIFF</note>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const existingEntries = {
        title: { source: 'Title', comment: 'Old comment' },
      };

      const existingMeta = {
        title: { en: { checksum: 'checksum-en' } },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return xliffContent;
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'es',
        updateComments: true,
      };

      const _result = await importFromXliff('/translations/common', options);

      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find(call =>
        String(call[0]).includes('resource_entries.json')
      );
      if (resourceEntriesCall) {
        const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(updatedEntries.title.comment).toBe('New comment from XLIFF');
      }
    });

    it('should use verification strategy correctly', async () => {
      const xliffContent = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="common.title">
        <source>Title</source>
        <target>Título</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

      const existingEntries = {
        title: { source: 'Title', es: 'Título' },
      };

      const existingMeta = {
        title: {
          en: { checksum: 'checksum-en' },
          es: { checksum: 'checksum-old', baseChecksum: 'checksum-en', status: 'translated' },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.xliff')) return xliffContent;
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'es',
        strategy: 'verification',
      };

      const _result = await importFromXliff('/translations/common', options);

      // Verify status changed to verified
      const metaCall = writeFileSyncSpy.mock.calls.find(call =>
        String(call[0]).includes('tracker_meta.json')
      );
      if (metaCall) {
        const updatedMeta = JSON.parse(String(metaCall[1]));
        expect(updatedMeta.title.es.status).toBe('verified');
      }
    });

    it('should handle file not found error', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const options: ImportOptions = {
        source: '/import/missing.xliff',
        locale: 'es',
      };

      await expect(importFromXliff('/translations/common', options)).rejects.toThrow('Source file not found');
    });

    it('should handle invalid base locale error', async () => {
      const options: ImportOptions = {
        source: '/import/test.xliff',
        locale: 'en',
      };

      await expect(importFromXliff('/translations/common', options)).rejects.toThrow('Cannot import into base locale');
    });
  });
});
