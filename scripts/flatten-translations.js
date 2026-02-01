#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { basename, join } from 'node:path';

const OUTPUT_DIR = 'dist/ds-translations';

/**
 * Recursively flatten a hierarchical object into dot-delimited keys.
 * Only includes leaf nodes that have a 'value' property.
 */
function flattenTranslations(obj, currentPath = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const newPath = currentPath ? `${currentPath}.${key}` : key;

    if (isLeafNode(value)) {
      result[newPath] = buildLeafObject(value);
    } else if (typeof value === 'object' && value !== null) {
      const flattened = flattenTranslations(value, newPath);
      Object.assign(result, flattened);
    }
  }

  return result;
}

/**
 * Determine if an object is a leaf node (has translation data).
 */
function isLeafNode(value) {
  return typeof value === 'object' && value !== null && 'value' in value;
}

/**
 * Build the output object for a leaf node, preserving only specific properties.
 * Property order: value, comment (if exists), status (if not 'default').
 */
function buildLeafObject(leafNode) {
  const result = {
    value: leafNode.value,
  };

  if (leafNode.comment !== undefined) {
    result.comment = leafNode.comment;
  }

  if (leafNode.status !== undefined && leafNode.status !== 'default') {
    result.status = leafNode.status;
  }

  return result;
}

/**
 * Process a single input file and write the flattened output.
 */
async function processFile(inputPath) {
  const outputPath = join(OUTPUT_DIR, basename(inputPath));

  try {
    const fileContent = await readFile(inputPath, 'utf-8');
    const parsedJson = JSON.parse(fileContent);
    const flattened = flattenTranslations(parsedJson);
    const outputJson = JSON.stringify(flattened, null, 2);

    await writeFile(outputPath, outputJson + '\n', 'utf-8');
    console.log(`Processing: ${inputPath} → ${outputPath}`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in file ${inputPath}`);
    } else {
      console.error(`Error processing file ${inputPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Main entry point.
 */
async function main() {
  const pattern = process.argv[2];

  if (!pattern) {
    console.error(
      'Usage: node scripts/flatten-translations.js <input-file-or-glob-pattern>',
    );
    process.exit(1);
  }

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const matchedFiles = [];
    for await (const filePath of glob(pattern)) {
      matchedFiles.push(filePath);
    }

    if (matchedFiles.length === 0) {
      console.error(`Error: No files found matching pattern: ${pattern}`);
      process.exit(1);
    }

    for (const filePath of matchedFiles) {
      await processFile(filePath);
    }

    console.log(
      `\nProcessed ${matchedFiles.length} file${matchedFiles.length === 1 ? '' : 's'}`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
