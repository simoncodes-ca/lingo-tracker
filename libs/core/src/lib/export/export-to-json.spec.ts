import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { exportToJson } from './export-to-json';
import { ExportOptions, FilteredResource } from './types';

// Mock fs module
vi.mock('fs');

describe('export-to-json', () => {
    const mockResources: FilteredResource[] = [
        {
            key: 'common.buttons.ok',
            value: 'Aceptar',
            baseValue: 'OK',
            comment: 'OK button',
            status: 'translated',
            tags: ['ui'],
            collection: 'Core',
            locale: 'es',
        },
        {
            key: 'common.buttons.cancel',
            value: 'Cancelar',
            baseValue: 'Cancel',
            status: 'translated',
            collection: 'Core',
            locale: 'es',
        },
        {
            key: 'home.title',
            value: 'Inicio',
            baseValue: 'Home',
            status: 'new',
            collection: 'App',
            locale: 'es',
        }
    ];

    const defaultOptions: ExportOptions = {
        format: 'json',
        outputDirectory: '/dist/export',
        jsonStructure: 'hierarchical',
        richJson: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should export hierarchical simple JSON by default', () => {
        const result = exportToJson(mockResources, defaultOptions);

        expect(result.filesCreated).toContain('es.json');
        expect(result.resourcesExported).toBe(3);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
            '/dist/export/es.json',
            expect.stringContaining('"common": {')
        );

        const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
        const content = JSON.parse(callArgs[1] as string);

        expect(content).toEqual({
            common: {
                buttons: {
                    ok: 'Aceptar',
                    cancel: 'Cancelar'
                }
            },
            home: {
                title: 'Inicio'
            }
        });
    });

    it('should export flat simple JSON', () => {
        const options = { ...defaultOptions, jsonStructure: 'flat' as const };
        exportToJson(mockResources, options);

        const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
        const content = JSON.parse(callArgs[1] as string);

        expect(content).toEqual({
            'common.buttons.ok': 'Aceptar',
            'common.buttons.cancel': 'Cancelar',
            'home.title': 'Inicio'
        });
    });

    it('should export hierarchical rich JSON', () => {
        const options = {
            ...defaultOptions,
            richJson: true,
            includeBase: true,
            includeStatus: true,
            includeTags: true
        };
        exportToJson(mockResources, options);

        const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
        const content = JSON.parse(callArgs[1] as string);

        expect(content.common.buttons.ok).toEqual({
            value: 'Aceptar',
            baseValue: 'OK',
            comment: 'OK button',
            status: 'translated',
            tags: ['ui']
        });

        // Cancel has no comment or tags, so those fields should be missing
        expect(content.common.buttons.cancel).toEqual({
            value: 'Cancelar',
            baseValue: 'Cancel',
            status: 'translated'
        });
    });

    it('should handle includeBase without richJson (special case)', () => {
        const options = { ...defaultOptions, includeBase: true };
        exportToJson(mockResources, options);

        const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
        const content = JSON.parse(callArgs[1] as string);

        expect(content.common.buttons.ok).toEqual({
            value: 'Aceptar',
            baseValue: 'OK'
        });
    });

    it('should detect hierarchical conflicts', () => {
        const conflictResources: FilteredResource[] = [
            {
                key: 'a',
                value: 'Value A',
                baseValue: 'A',
                status: 'translated',
                collection: 'Core',
                locale: 'es',
            },
            {
                key: 'a.b',
                value: 'Value B',
                baseValue: 'B',
                status: 'translated',
                collection: 'Core',
                locale: 'es',
            }
        ];

        const result = exportToJson(conflictResources, defaultOptions);

        expect(result.hierarchicalConflicts).toHaveLength(1);
        expect(result.hierarchicalConflicts[0]).toContain('conflicts with parent');
    });

    it('should use custom filename pattern', () => {
        const options = { ...defaultOptions, filenamePattern: 'custom-{locale}' };
        const result = exportToJson(mockResources, options);

        expect(result.filesCreated).toContain('custom-es.json');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            '/dist/export/custom-es.json',
            expect.any(String)
        );
    });
});
