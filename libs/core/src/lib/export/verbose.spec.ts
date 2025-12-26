import { describe, it, expect, vi } from 'vitest';
import { exportToJson } from './export-to-json';
import { exportToXliff } from './export-to-xliff';
import { ExportOptions, FilteredResource } from './types';

vi.mock('fs');
vi.mock('xliff', () => ({
    jsToXliff12: (_obj: any, _opt: any, cb: any) => cb(null, '<xliff>...</xliff>'),
}));

describe('Verbose Logging', () => {
    const mockResources: FilteredResource[] = [
        { key: 'test', value: 'Test', baseValue: 'Test', status: 'translated', collection: 'Core', locale: 'es' }
    ];

    const mockOptions: ExportOptions = {
        format: 'json',
        outputDirectory: '/dist',
        collections: ['Core'],
        locales: ['es'],
        dryRun: false,
    };

    it('should call onProgress in exportToJson', () => {
        const onProgress = vi.fn();
        exportToJson(mockResources, { ...mockOptions, onProgress });

        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Processing es'));
        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Writing'));
    });

    it('should call onProgress in exportToXliff', async () => {
        const onProgress = vi.fn();
        await exportToXliff(mockResources, { ...mockOptions, onProgress }, 'en');

        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Processing es'));
        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Writing'));
    });
});
