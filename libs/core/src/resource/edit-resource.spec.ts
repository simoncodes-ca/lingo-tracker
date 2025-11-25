import { describe, it, expect, beforeEach, vi } from 'vitest';
import { editResource } from './edit-resource';
import * as fs from 'node:fs';
import { SafeAny, RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

vi.mock('node:fs');

describe('editResource', () => {
    const translationsFolder = 'translations';
    const cwd = '/test';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{}');
        vi.mocked(fs.writeFileSync).mockImplementation(vi.fn());
    });

    it('should throw error if resource file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        expect(() =>
            editResource(translationsFolder, { key: 'buttons.save', cwd })
        ).toThrow(/Resource not found/);
    });

    it('should throw error if resource entry does not exist in file', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
        expect(() =>
            editResource(translationsFolder, { key: 'buttons.save', cwd })
        ).toThrow(/Resource not found/);
    });

    it('should return updated: false if no changes are made', () => {
        const initialResources = {
            save: { source: 'Save' },
        };
        const initialMeta = {
            save: { en: { checksum: 'abc' } },
        };

        vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
            if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
            if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
            return '{}';
        });

        const result = editResource(translationsFolder, {
            key: 'buttons.save',
            baseValue: 'Save',
            cwd,
        });

        expect(result.updated).toBe(false);
    });

    it('should update base value and mark other locales as stale', () => {
        const initialResources = {
            save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
        };
        const initialMeta = {
            save: {
                en: { checksum: 'old_base_hash' },
                'fr-ca': { checksum: 'fr_hash', baseChecksum: 'old_base_hash', status: 'translated' },
            },
        };

        vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
            if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
            if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
            return '{}';
        });

        const result = editResource(translationsFolder, {
            key: 'buttons.save',
            baseValue: 'Save Item',
            cwd,
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
        const updatedMeta = JSON.parse(writeCall[1][1] as string);

        expect(updatedMeta.save.en.checksum).not.toBe('old_base_hash');
        expect(updatedMeta.save['fr-ca'].status).toBe('stale');
        expect(updatedMeta.save['fr-ca'].baseChecksum).toBe(updatedMeta.save.en.checksum);

        const updatedResources = JSON.parse(writeCall[0][1] as string);
        expect(updatedResources.save.source).toBe('Save Item');
    });

    it('should update comment and tags', () => {
        const initialResources = {
            save: { source: 'Save' },
        };
        const initialMeta = {
            save: { en: { checksum: 'abc' } },
        };

        vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
            if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
            if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
            return '{}';
        });

        const result = editResource(translationsFolder, {
            key: 'buttons.save',
            comment: 'New comment',
            tags: ['ui', 'action'],
            cwd,
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
        const updatedResources = JSON.parse(writeCall[0][1] as string);
        expect(updatedResources.save.comment).toBe('New comment');
        expect(updatedResources.save.tags).toEqual(['ui', 'action']);
    });

    it('should update locale value and set status to translated', () => {
        const initialResources = {
            save: { source: 'Save', 'fr-ca': 'Sauvegarder' },
        };
        const initialMeta = {
            save: {
                en: { checksum: 'base_hash' },
                'fr-ca': { checksum: 'old_fr_hash', baseChecksum: 'base_hash', status: 'stale' },
            },
        };

        vi.mocked(fs.readFileSync).mockImplementation((path: SafeAny) => {
            if ((path as string).includes(RESOURCE_ENTRIES_FILENAME)) return JSON.stringify(initialResources);
            if ((path as string).includes(TRACKER_META_FILENAME)) return JSON.stringify(initialMeta);
            return '{}';
        });

        const result = editResource(translationsFolder, {
            key: 'buttons.save',
            locales: { 'fr-ca': { value: 'Enregistrer' } },
            cwd,
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
        const updatedResources = JSON.parse(writeCall[0][1] as string);
        expect(updatedResources.save['fr-ca']).toBe('Enregistrer');

        const updatedMeta = JSON.parse(writeCall[1][1] as string);
        expect(updatedMeta.save['fr-ca'].status).toBe('translated');
        expect(updatedMeta.save['fr-ca'].checksum).not.toBe('old_fr_hash');
    });
});
