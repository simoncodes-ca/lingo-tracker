import type { ExportOptions, ExportResult, FilteredResource } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { jsToXliff12 } from 'xliff';

/**
 * Exports resources to XLIFF 1.2 format.
 */
export async function exportToXliff(
  resources: FilteredResource[],
  options: ExportOptions,
  baseLocale: string,
): Promise<ExportResult> {
  const result: ExportResult = {
    format: 'xliff',
    filesCreated: [],
    resourcesExported: 0,
    warnings: [],
    errors: [],
    collections: options.collections || [],
    locales: options.locales || [],
    outputDirectory: options.outputDirectory,
    omittedResources: [],
    malformedFiles: [],
    hierarchicalConflicts: [],
  };

  // Group resources by locale
  const resourcesByLocale = new Map<string, FilteredResource[]>();
  for (const resource of resources) {
    if (!resourcesByLocale.has(resource.locale)) {
      resourcesByLocale.set(resource.locale, []);
    }
    resourcesByLocale.get(resource.locale)?.push(resource);
  }

  for (const [locale, localeResources] of resourcesByLocale.entries()) {
    try {
      if (options.onProgress) {
        options.onProgress(`Processing ${locale} (${localeResources.length} resources)`);
      }

      const filename = getFilename(locale, options, baseLocale);
      const filePath = path.join(options.outputDirectory, filename);

      // Prepare data for xliff library
      // Structure: resources -> namespace -> key -> { source, target, note }
      // We'll use a default namespace 'translations' as we merge everything.
      const xliffData = {
        resources: {
          translations: {} as Record<string, { source: string; target: string; note?: string }>,
        },
      };

      for (const res of localeResources) {
        xliffData.resources.translations[res.key] = {
          source: res.baseValue,
          target: res.value,
          ...(res.comment ? { note: res.comment } : {}),
        };
      }

      // Generate XLIFF
      // jsToXliff12(obj, options, cb)
      const xliffContent = await new Promise<string>((resolve, reject) => {
        jsToXliff12(
          xliffData,
          {
            targetLanguage: locale,
            sourceLanguage: baseLocale,
            indent: '  ',
          },
          (err: Error | null, res: string) => {
            if (err) reject(err);
            else resolve(res);
          },
        );
      });

      if (fs.existsSync(filePath)) {
        result.warnings.push(`Overwriting existing file: ${filename}`);
      }

      if (!options.dryRun) {
        if (options.onProgress) {
          options.onProgress(`Writing ${filePath}`);
        }
        fs.writeFileSync(filePath, xliffContent);
      }

      result.filesCreated.push(filename);
      result.resourcesExported += localeResources.length;
    } catch (error) {
      result.errors.push(`Failed to export locale ${locale}: ${(error as Error).message}`);
    }
  }

  return result;
}

function getFilename(locale: string, options: ExportOptions, baseLocale: string): string {
  if (options.filenamePattern) {
    let name = options.filenamePattern
      .replace('{target}', locale)
      .replace('{locale}', locale)
      .replace('{source}', baseLocale)
      .replace('{date}', new Date().toISOString().split('T')[0]);

    if (!name.endsWith('.xliff')) {
      name += '.xliff';
    }
    return name;
  }
  return `${locale}.xliff`;
}
