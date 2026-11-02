/**
 * Typed handles for `vi.mock('fs')` specs.
 *
 * Spec-only (imports vitest): `*.spec-helpers.ts` files are excluded from the library build.
 */
import * as fs from 'fs';
import { type MockedFunction, vi } from 'vitest';

/** The two `readdirSync` forms core calls: `readdirSync(dir)` and `readdirSync(dir, { withFileTypes: true })`. */
export type ReaddirSync = (path: fs.PathLike, options?: { withFileTypes?: boolean }) => string[] | fs.Dirent[];

/**
 * `fs.readdirSync` from a mocked `fs`. The function is overloaded, and `vi.mocked()` types it by its
 * last overload (`encoding: 'buffer'`, returns `Dirent<Buffer>[]`), which core never calls. This
 * handle types the mock by the forms core does call. The spec must call `vi.mock('fs')`.
 */
export function mockedReaddirSync(): MockedFunction<ReaddirSync> {
  // Narrow the overload set to the signatures core uses; the runtime value is the same vi.fn.
  return vi.mocked(fs.readdirSync as ReaddirSync);
}
