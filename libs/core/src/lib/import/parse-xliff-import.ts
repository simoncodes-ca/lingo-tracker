import { existsSync, readFileSync } from 'node:fs';
import * as xliff from 'xliff';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import { PROTECTED_TERMS_NOTE_PREFIX } from '../export/export-to-xliff';
import type { ImportedResource, ImportParseOptions, ParsedImport } from './types';

/**
 * The comment carried by a trans-unit's `<note>` elements: one note per line. The exporter's
 * protected-terms annotation (`Do not translate: …`) is not a comment and is dropped. Undefined
 * when no note is left.
 */
function commentFromNotes(note: string | string[] | undefined): string | undefined {
  const notes = (Array.isArray(note) ? note : [note]).filter(
    (n): n is string => typeof n === 'string' && n !== '' && !n.startsWith(PROTECTED_TERMS_NOTE_PREFIX),
  );
  return notes.length > 0 ? notes.join('\n') : undefined;
}

/**
 * Extracts translation resources from XLIFF 1.2 format content.
 *
 * XLIFF (XML Localization Interchange File Format) is an industry standard format
 * used by professional translation services. This function parses XLIFF 1.2 files
 * and extracts translation units (trans-units) with their source and target values.
 *
 * Each trans-unit is converted to an ImportedResource with:
 * - `key`: The trans-unit id (translation key)
 * - `value`: The target translation
 * - `baseValue`: The source reference value
 * - `comment`: Developer notes from <note> elements, one per line; the exporter's
 *   `Do not translate: …` note is dropped
 *
 * Trans-units with empty or missing target values are automatically skipped.
 *
 * @param xliffContent - The raw XLIFF 1.2 XML content as a string
 * @returns Array of imported resources extracted from all trans-units in the XLIFF file
 *
 * @throws {Error} If XLIFF content cannot be parsed or is malformed
 *
 * @example
 * ```typescript
 * const xliffXml = `<?xml version="1.0"?>
 * <xliff version="1.2">
 *   <file source-language="en" target-language="es">
 *     <body>
 *       <trans-unit id="common.ok">
 *         <source>OK</source>
 *         <target>Aceptar</target>
 *         <note>Button text</note>
 *       </trans-unit>
 *     </body>
 *   </file>
 * </xliff>`;
 *
 * const resources = await extractFromXliff(xliffXml);
 * // Returns: [{
 * //   key: "common.ok",
 * //   value: "Aceptar",
 * //   baseValue: "OK",
 * //   comment: "Button text"
 * // }]
 * ```
 */
export async function extractFromXliff(xliffContent: string): Promise<ImportedResource[]> {
  const resources: ImportedResource[] = [];

  try {
    // Parse XLIFF content using callback-based API
    const parsed = await new Promise<xliff.XliffData>((resolve, reject) => {
      xliff.xliff12ToJs(xliffContent, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    // Extract resources from each file
    for (const transUnits of Object.values(parsed.resources)) {
      for (const [key, unit] of Object.entries(transUnits)) {
        // Skip if no target or target is empty
        if (!unit.target || unit.target.trim() === '') {
          continue;
        }

        const resource: ImportedResource = {
          key,
          value: unit.target,
        };

        // Add base value from source
        if (unit.source) {
          resource.baseValue = unit.source;
        }

        const comment = commentFromNotes(unit.note);
        if (comment) {
          resource.comment = comment;
        }

        resources.push(resource);
      }
    }
  } catch (error) {
    throw new CoreOperationError(`Failed to parse XLIFF content: ${error}`);
  }

  return resources;
}

/**
 * Reads an XLIFF 1.2 import file and returns resources with empty findings: the XLIFF format adapter for
 * {@link importResources}. Each trans-unit becomes a resource (`id` → key, `<target>` → value,
 * `<source>` → baseValue, `<note>` → comment); trans-units without a target are skipped.
 *
 * @param filePath - Path of the XLIFF file (relative paths resolve against the working directory)
 * @throws {Error} The file does not exist or cannot be read, or it is not valid XLIFF.
 */
export async function parseXliffImport(filePath: string, options: ImportParseOptions = {}): Promise<ParsedImport> {
  const { onProgress } = options;
  if (!existsSync(filePath)) {
    throw new CoreOperationError(`Source file not found: ${filePath}`);
  }

  onProgress?.(`Reading XLIFF file: ${filePath}`);

  let xliffContent: string;
  try {
    xliffContent = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new CoreOperationError(`Failed to read XLIFF file: ${error}`);
  }

  onProgress?.('Parsing XLIFF and extracting trans-units');
  const resources = await extractFromXliff(xliffContent);
  onProgress?.(`Extracted ${resources.length} resources from XLIFF`);
  return { resources, skipped: [], warnings: [] };
}
