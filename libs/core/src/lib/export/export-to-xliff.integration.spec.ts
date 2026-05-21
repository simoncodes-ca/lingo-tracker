import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import { exportToXliff } from './export-to-xliff';
import type { ExportOptions, FilteredResource } from './types';

vi.mock('fs');

describe('export-to-xliff (integration)', () => {
  const resources: FilteredResource[] = [
    {
      key: 'common.ok',
      value: 'Aceptar',
      baseValue: 'OK',
      status: 'translated',
      tags: [],
      collection: 'Core',
      locale: 'es',
    },
  ];

  const options: ExportOptions = {
    format: 'xliff',
    outputDirectory: '/dist/export',
  };

  it('emits source-language and target-language attributes on the file element', async () => {
    let writtenContent = '';
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => {
      writtenContent = content as string;
    });

    await exportToXliff(resources, options, 'en');

    expect(writtenContent).toContain('source-language="en"');
    expect(writtenContent).toContain('target-language="es"');
  });
});
