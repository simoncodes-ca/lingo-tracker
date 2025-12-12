import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { editResourceCommand } from './edit-resource';
import prompts from 'prompts';
import { editResource } from '@simoncodes-ca/core';

vi.mock('node:fs');
vi.mock('prompts');
vi.mock('@simoncodes-ca/core', async () => {
    const actual = await vi.importActual('@simoncodes-ca/core');
    return {
        ...actual,
        editResource: vi.fn()
    };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockEditResource = vi.mocked(editResource);

describe('editResourceCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.INIT_CWD = '/test/project';
    });

    const mockConfig = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: {
            'default': {
                translationsFolder: 'src/i18n',
                baseLocale: 'en'
            }
        }
    };

    it('should update a resource successfully', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
        mockEditResource.mockReturnValue({
            resolvedKey: 'apps.common.buttons.ok',
            updated: true
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok',
            baseValue: 'OK Updated'
        };

        await editResourceCommand(options);

        expect(mockEditResource).toHaveBeenCalledWith(
            '/test/project/src/i18n',
            expect.objectContaining({
                key: 'apps.common.buttons.ok',
                baseValue: 'OK Updated',
                baseLocale: 'en'
            })
        );
    });

    it('should handle no changes detected', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
        mockEditResource.mockReturnValue({
            resolvedKey: 'apps.common.buttons.ok',
            updated: false,
            message: 'No changes detected'
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok',
            baseValue: 'OK'
        };

        await editResourceCommand(options);

        expect(mockEditResource).toHaveBeenCalled();
    });

    it('should update comment and tags', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
        mockEditResource.mockReturnValue({
            resolvedKey: 'apps.common.buttons.ok',
            updated: true
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok',
            comment: 'New comment',
            tags: 'ui, buttons'
        };

        await editResourceCommand(options);

        expect(mockEditResource).toHaveBeenCalledWith(
            '/test/project/src/i18n',
            expect.objectContaining({
                comment: 'New comment',
                tags: ['ui', 'buttons']
            })
        );
    });

    it('should update locale value', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
        mockEditResource.mockReturnValue({
            resolvedKey: 'apps.common.buttons.ok',
            updated: true
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok',
            locale: 'fr',
            localeValue: 'D\'accord'
        };

        await editResourceCommand(options);

        expect(mockEditResource).toHaveBeenCalledWith(
            '/test/project/src/i18n',
            expect.objectContaining({
                locales: {
                    fr: { value: 'D\'accord' }
                }
            })
        );
    });

    it('should warn if locale provided without value', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

        const consoleSpy = vi.spyOn(console, 'log');

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok',
            locale: 'fr'
            // Missing localeValue
        };

        await editResourceCommand(options);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Both --locale and --localeValue must be provided'));
        expect(mockEditResource).toHaveBeenCalledWith(
            expect.any(String),
            expect.not.objectContaining({
                locales: expect.anything()
            })
        );
    });

    it('should not update if config does not exist', async () => {
        mockReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT: no such file or directory');
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok'
        };

        await editResourceCommand(options);

        expect(mockEditResource).not.toHaveBeenCalled();
    });

    it('should not update if collection does not exist', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

        const options = {
            collection: 'nonexistent',
            key: 'apps.common.buttons.ok'
        };

        await editResourceCommand(options);

        expect(mockEditResource).not.toHaveBeenCalled();
    });

    it('should prompt for baseValue if not provided', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
        mockEditResource.mockReturnValue({
            resolvedKey: 'apps.common.buttons.ok',
            updated: true
        });

        // Mock prompts to return baseValue
        const promptsMock = vi.mocked(prompts);
        promptsMock.mockResolvedValueOnce({
            baseValue: 'Promped Value'
        });

        const options = {
            collection: 'default',
            key: 'apps.common.buttons.ok'
        };

        // Mock isTTY to true to trigger prompts
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

        try {
            await editResourceCommand(options);
        } finally {
            Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
        }

        expect(promptsMock).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'baseValue',
                    type: 'text'
                })
            ]),
            expect.any(Object)
        );

        expect(mockEditResource).toHaveBeenCalledWith(
            '/test/project/src/i18n',
            expect.objectContaining({
                baseValue: 'Promped Value'
            })
        );
    });
});
