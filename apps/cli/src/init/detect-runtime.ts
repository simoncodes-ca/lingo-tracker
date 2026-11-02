import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppRuntime } from '@simoncodes-ca/domain';

/** Detect the host app's runtime from its direct dependencies, tolerating unavailable manifests. */
export function detectRuntime(cwd: string): AppRuntime | undefined {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof manifest !== 'object' || manifest === null) return undefined;

  const dependencies = ['dependencies', 'devDependencies'].flatMap((field) => {
    const value: unknown = Reflect.get(manifest, field);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  });
  if (
    dependencies.some(
      (name) => name === '@jsverse/transloco-messageformat' || name === '@ngneat/transloco-messageformat',
    )
  ) {
    return 'transloco-messageformat';
  }
  if (dependencies.some((name) => name === '@jsverse/transloco' || name === '@ngneat/transloco')) {
    return 'transloco';
  }
  return undefined;
}
