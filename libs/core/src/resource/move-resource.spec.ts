import { join } from 'node:path';
import { moveResource } from './move-resource';
import { RESOURCE_ENTRIES_FILENAME } from '../constants';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import * as fs from 'node:fs';

// Mock node:fs
vi.mock('node:fs', () => {
    return {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
        unlinkSync: vi.fn(),
    };
});

describe('Move Resource', () => {
    const testDir = '/tmp/test-move-unified';
    // In-memory file system: path -> content (string)
    let mockFileSystem: Map<string, string>;
    // In-memory directories: Set<path>
    let mockDirectories: Set<string>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFileSystem = new Map();
        mockDirectories = new Set();

        // Setup default mocks
        (fs.existsSync as Mock).mockImplementation((path: string) => {
            return mockFileSystem.has(path) || mockDirectories.has(path);
        });

        (fs.readFileSync as Mock).mockImplementation((path: string) => {
            if (mockFileSystem.has(path)) {
                return mockFileSystem.get(path);
            }
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        });

        (fs.writeFileSync as Mock).mockImplementation((path: string, data: string) => {
            mockFileSystem.set(path, data);
        });

        (fs.mkdirSync as Mock).mockImplementation((path: string) => {
            mockDirectories.add(path);
        });

        (fs.rmSync as Mock).mockImplementation((path: string) => {
            mockFileSystem.delete(path);
            mockDirectories.delete(path);
            // Also remove children
            for (const key of mockFileSystem.keys()) {
                if (key.startsWith(path)) {
                    mockFileSystem.delete(key);
                }
            }
            for (const dir of mockDirectories) {
                if (dir.startsWith(path)) {
                    mockDirectories.delete(dir);
                }
            }
        });

        (fs.unlinkSync as Mock).mockImplementation((path: string) => {
            if (mockFileSystem.has(path)) {
                mockFileSystem.delete(path);
            } else {
                throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
            }
        });

        (fs.readdirSync as Mock).mockImplementation((path: string) => {
            // Find direct children
            const children = new Set<string>();
            // Check files
            for (const file of mockFileSystem.keys()) {
                if (file.startsWith(path) && file !== path) {
                    const relative = file.slice(path.length + 1); // +1 for separator
                    const firstPart = relative.split('/')[0]; // Assumes / separator in mock
                    if (firstPart) children.add(firstPart);
                }
            }
            // Check dirs
            for (const dir of mockDirectories) {
                if (dir.startsWith(path) && dir !== path) {
                    const relative = dir.slice(path.length + 1);
                    const firstPart = relative.split('/')[0];
                    if (firstPart) children.add(firstPart);
                }
            }
            return Array.from(children);
        });

        (fs.statSync as Mock).mockImplementation((path: string) => {
            return {
                isDirectory: () => mockDirectories.has(path),
                isFile: () => mockFileSystem.has(path)
            };
        });

        // Ensure testDir exists
        mockDirectories.add(testDir);
    });

    describe('Single Resource Move', () => {
        it('should move a single resource successfully', () => {
            // Setup source
            const sourceFolder = join(testDir, 'common', 'buttons');
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                ok: { source: 'OK', comment: 'OK button' }
            }));

            const result = moveResource(testDir, {
                source: 'common.buttons.ok',
                destination: 'common.actions.ok'
            });

            expect(result.movedCount).toBe(1);
            expect(result.errors).toHaveLength(0);

            // Verify source gone
            // In this case, since 'ok' was the only key, the file should be deleted by deleteResource -> unlinkSync
            expect(mockFileSystem.has(sourceFile)).toBe(false);

            // Verify dest exists
            const destFolder = join(testDir, 'common', 'actions');
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            expect(mockFileSystem.has(destFile)).toBe(true);

            const destContent = JSON.parse(mockFileSystem.get(destFile)!);
            expect(destContent.ok).toBeDefined();
            expect(destContent.ok.source).toBe('OK');
        });

        it('should warn and skip if destination exists and override is false', () => {
            // Setup source
            const sourceFolder = join(testDir, 'a');
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                key: { source: 'Source' }
            }));

            // Setup dest
            const destFolder = join(testDir, 'b');
            mockDirectories.add(destFolder);
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(destFile, JSON.stringify({
                key: { source: 'Dest' }
            }));

            const result = moveResource(testDir, {
                source: 'a.key',
                destination: 'b.key',
                override: false
            });

            expect(result.movedCount).toBe(0);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('already exists');

            // Verify no change
            const sourceContent = JSON.parse(mockFileSystem.get(sourceFile)!);
            expect(sourceContent.key).toBeDefined();
        });

        it('should override if destination exists and override is true', () => {
            // Setup source
            const sourceFolder = join(testDir, 'a');
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                key: { source: 'Source' }
            }));

            // Setup dest
            const destFolder = join(testDir, 'b');
            mockDirectories.add(destFolder);
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(destFile, JSON.stringify({
                key: { source: 'Dest' }
            }));

            const result = moveResource(testDir, {
                source: 'a.key',
                destination: 'b.key',
                override: true
            });

            expect(result.movedCount).toBe(1);

            // Verify dest updated
            const destContent = JSON.parse(mockFileSystem.get(destFile)!);
            expect(destContent.key.source).toBe('Source');
        });
    });

    describe('Wildcard Pattern Move', () => {
        it('should move multiple resources matching pattern', () => {
            // Setup: common.buttons.ok, common.buttons.cancel
            const sourceFolder = join(testDir, 'common', 'buttons');
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                ok: { source: 'OK' },
                cancel: { source: 'Cancel' }
            }));

            const result = moveResource(testDir, {
                source: 'common.buttons.*',
                destination: 'common.actions'
            });

            expect(result.movedCount).toBe(2);
            expect(result.errors).toHaveLength(0);

            // Verify dest
            const destFolder = join(testDir, 'common', 'actions');
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            expect(mockFileSystem.has(destFile)).toBe(true);

            const destContent = JSON.parse(mockFileSystem.get(destFile)!);
            expect(destContent.ok).toBeDefined();
            expect(destContent.cancel).toBeDefined();
        });

        it('should handle nested resources in wildcard', () => {
            // Setup: common.buttons.ok, common.buttons.sub.item
            const buttonsFolder = join(testDir, 'common', 'buttons');
            mockDirectories.add(buttonsFolder);
            const buttonsFile = join(buttonsFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(buttonsFile, JSON.stringify({
                ok: { source: 'OK' }
            }));

            const subFolder = join(buttonsFolder, 'sub');
            mockDirectories.add(subFolder);
            const subFile = join(subFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(subFile, JSON.stringify({
                item: { source: 'Item' }
            }));

            const result = moveResource(testDir, {
                source: 'common.buttons.*',
                destination: 'common.actions'
            });

            expect(result.movedCount).toBe(2);

            // Verify dest
            const actionsFolder = join(testDir, 'common', 'actions');
            const actionsFile = join(actionsFolder, RESOURCE_ENTRIES_FILENAME);
            const actionsContent = JSON.parse(mockFileSystem.get(actionsFile)!);
            expect(actionsContent.ok).toBeDefined();

            const subActionsFolder = join(actionsFolder, 'sub');
            const subActionsFile = join(subActionsFolder, RESOURCE_ENTRIES_FILENAME);
            const subActionsContent = JSON.parse(mockFileSystem.get(subActionsFile)!);
            expect(subActionsContent.item).toBeDefined();
        });
    });
    describe('Cross-Collection Move', () => {
        it('should move resource to a different destination folder', () => {
            // Setup source in collection A
            const collectionAFolder = join(testDir, 'collectionA');
            const sourceFolder = join(collectionAFolder, 'common', 'buttons');
            mockDirectories.add(collectionAFolder);
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                ok: { source: 'OK' }
            }));

            // Setup dest in collection B
            const collectionBFolder = join(testDir, 'collectionB');
            mockDirectories.add(collectionBFolder);

            const result = moveResource(collectionAFolder, {
                source: 'common.buttons.ok',
                destination: 'common.actions.ok',
                destinationTranslationsFolder: collectionBFolder
            });

            expect(result.movedCount).toBe(1);
            expect(result.errors).toHaveLength(0);

            // Verify source gone from A
            expect(mockFileSystem.has(sourceFile)).toBe(false);

            // Verify dest exists in B
            const destFolder = join(collectionBFolder, 'common', 'actions');
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            expect(mockFileSystem.has(destFile)).toBe(true);

            const destContent = JSON.parse(mockFileSystem.get(destFile)!);
            expect(destContent.ok).toBeDefined();
            expect(destContent.ok.source).toBe('OK');
        });

        it('should move wildcard resources to a different destination folder', () => {
            // Setup source in collection A
            const collectionAFolder = join(testDir, 'collectionA');
            const sourceFolder = join(collectionAFolder, 'common', 'buttons');
            mockDirectories.add(collectionAFolder);
            mockDirectories.add(sourceFolder);
            const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
            mockFileSystem.set(sourceFile, JSON.stringify({
                ok: { source: 'OK' },
                cancel: { source: 'Cancel' }
            }));

            // Setup dest in collection B
            const collectionBFolder = join(testDir, 'collectionB');
            mockDirectories.add(collectionBFolder);

            const result = moveResource(collectionAFolder, {
                source: 'common.buttons.*',
                destination: 'common.actions',
                destinationTranslationsFolder: collectionBFolder
            });

            expect(result.movedCount).toBe(2);

            // Verify dest in B
            const destFolder = join(collectionBFolder, 'common', 'actions');
            const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
            expect(mockFileSystem.has(destFile)).toBe(true);

            const destContent = JSON.parse(mockFileSystem.get(destFile)!);
            expect(destContent.ok).toBeDefined();
            expect(destContent.cancel).toBeDefined();
        });
    });

    describe('Security', () => {
        it('should handle invalid characters in pattern during scanning', () => {
            // Test with invalid characters that shouldn't be allowed in keys
            const invalidPattern = 'invalid@char*';
            const invalidPath = join(testDir, 'invalid@char');

            const result = moveResource(testDir, {
                source: invalidPattern,
                destination: 'dest'
            });

            // It should NOT try to check if the folder exists because validation should fail first
            expect(fs.existsSync).not.toHaveBeenCalledWith(invalidPath);

            // It should return error
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Invalid key segment');
        });
    });
});
