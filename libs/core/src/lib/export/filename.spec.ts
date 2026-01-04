import { describe, it, expect } from 'vitest';
import { exportToJson } from './export-to-json';
import { exportToXliff } from './export-to-xliff';
import { ExportOptions, FilteredResource } from './types';

// Mock fs to avoid file writes
import { vi } from 'vitest';
vi.mock('fs');
vi.mock('xliff', () => ({
    jsToXliff12: (_obj: unknown, _opt: unknown, cb: (err: Error | null, result: string) => void) => cb(null, '<xliff>...</xliff>'),
}));

describe('Filename Generation', () => {
    const mockResources: FilteredResource[] = [
        { key: 'test', value: 'Test', baseValue: 'Test', status: 'translated', collection: 'Core', locale: 'es' }
    ];

    const baseOptions: ExportOptions = {
        format: 'json',
        outputDirectory: '/dist',
        collections: ['Core'],
        locales: ['es'],
        dryRun: true, // Important: Dry run to avoid FS calls
    };

    it('should use default filename for JSON', () => {
        const result = exportToJson(mockResources, baseOptions);
        expect(result.filesCreated).toContain('es.json');
    });

    it('should use default filename for XLIFF', async () => {
        const result = await exportToXliff(mockResources, baseOptions, 'en');
        expect(result.filesCreated).toContain('es.xliff');
    });

    it('should support {locale} placeholder in JSON', () => {
        const options = { ...baseOptions, filenamePattern: 'custom-{locale}' };
        const result = exportToJson(mockResources, options);
        expect(result.filesCreated).toContain('custom-es.json');
    });

    it('should support {target} placeholder in JSON', () => {
        const options = { ...baseOptions, filenamePattern: 'target-{target}' };
        const result = exportToJson(mockResources, options);
        expect(result.filesCreated).toContain('target-es.json');
    });

    it('should support {source} placeholder in JSON', () => {
        const options = { ...baseOptions, filenamePattern: '{source}-to-{target}' };
        const result = exportToJson(mockResources, options, 'en');
        expect(result.filesCreated).toContain('en-to-es.json');
    });

    it('should support {source} placeholder in XLIFF', async () => {
        const options = { ...baseOptions, filenamePattern: '{source}-to-{target}' };
        const result = await exportToXliff(mockResources, options, 'en');
        expect(result.filesCreated).toContain('en-to-es.xliff');
    });

    it('should append extension if missing', () => {
        const options = { ...baseOptions, filenamePattern: 'my-file' };
        const result = exportToJson(mockResources, options);
        expect(result.filesCreated).toContain('my-file.json');
    });
});
