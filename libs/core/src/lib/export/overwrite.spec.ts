import { describe, it, expect, vi } from 'vitest';
import { exportToJson } from './export-to-json';
import type { ExportOptions, FilteredResource } from './types';
import * as fs from 'fs';

vi.mock('fs');

describe('Overwrite Warning', () => {
  const mockResources: FilteredResource[] = [
    {
      key: 'test',
      value: 'Test',
      baseValue: 'Test',
      status: 'translated',
      collection: 'Core',
      locale: 'es',
    },
  ];

  const mockOptions: ExportOptions = {
    format: 'json',
    outputDirectory: '/dist',
    collections: ['Core'],
    locales: ['es'],
    dryRun: false,
  };

  it('should add warning if file exists', () => {
    // Mock fs.existsSync to return true
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    const result = exportToJson(mockResources, mockOptions);

    expect(result.warnings).toContain('Overwriting existing file: es.json');
  });

  it('should not add warning if file does not exist', () => {
    // Mock fs.existsSync to return false
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    const result = exportToJson(mockResources, mockOptions);

    expect(result.warnings).not.toContain('Overwriting existing file: es.json');
  });
});
