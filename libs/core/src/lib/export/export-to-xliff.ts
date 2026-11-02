import * as fs from 'node:fs';
import * as path from 'node:path';
import { jsToXliff12, type XliffData, type XliffResource } from 'xliff';
import { exportFileName } from './export-file-name';
import type { ExportOptions, ExportResult, FilteredResource } from './types';

/**
 * Starts the `<note>` the exporter adds for a unit's protected terms (`Do not translate: iPhone, C++`).
 * It is an export annotation, not a comment: the XLIFF import drops notes with this prefix.
 */
export const PROTECTED_TERMS_NOTE_PREFIX = 'Do not translate:';

/**
 * Exports resources to XLIFF 1.2 format.
 */
export async function exportToXliff(
  resources: FilteredResource[],
  options: ExportOptions,
  baseLocale: string,
  prepared?: { fileName: string },
): Promise<ExportResult> {
  const date = new Date();
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

      const filename = prepared?.fileName ?? exportFileName('xliff', locale, baseLocale, options.filenamePattern, date);
      const filePath = path.join(options.outputDirectory, filename);

      // Prepare data for xliff library
      // Structure: resources -> namespace -> key -> { source, target, note }
      // We'll use a default namespace 'translations' as we merge everything.
      const translations: Record<string, XliffResource> = {};
      const xliffData: XliffData = {
        sourceLanguage: baseLocale,
        targetLanguage: locale,
        resources: { translations },
      };

      for (const res of localeResources) {
        const doNotTranslate = res.protectedTermsFound?.length
          ? `${PROTECTED_TERMS_NOTE_PREFIX} ${res.protectedTermsFound.join(', ')}`
          : undefined;
        const note = [res.comment, doNotTranslate].filter((n): n is string => Boolean(n));

        translations[res.key] = {
          source: res.baseValue,
          target: res.value,
          ...(note.length ? { note } : {}),
        };
      }

      // Generate XLIFF
      // jsToXliff12(obj, options, cb)
      const xliffContent = await new Promise<string>((resolve, reject) => {
        jsToXliff12(
          xliffData,
          {
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
