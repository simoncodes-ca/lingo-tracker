import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

export type ConfigWriteOutcome =
  | { readonly status: 'succeeded' }
  | { readonly status: 'failed'; readonly error: unknown; readonly reverted: boolean };

/** A prepared companion write; all destinations are snapshotted before the first write. */
export interface CompanionFileWrite {
  readonly path: string;
  write(): void;
}

interface FileSnapshot {
  readonly path: string;
  /** Undefined preserves an existing directory; null means the file did not exist. */
  readonly contents?: Buffer | null;
}

function snapshotFile(path: string): FileSnapshot {
  if (!existsSync(path)) return { path, contents: null };
  return statSync(path).isFile() ? { path, contents: readFileSync(path) } : { path };
}

function attachRestoreFailure(original: unknown, failures: unknown[]): void {
  if (!(original instanceof Error) || failures.length === 0) return;
  const restoreFailure =
    failures.length === 1 ? failures[0] : Object.assign(new Error('Config write restore failed'), { failures });
  const priorCause = (original as Error & { cause?: unknown }).cause;
  const cause =
    priorCause === undefined
      ? restoreFailure
      : Object.assign(new Error(`${String(priorCause)}; restore failed: ${String(restoreFailure)}`), {
          priorCause,
          restoreFailure,
        });
  Object.defineProperty(original, 'cause', { value: cause, configurable: true });
}

/** Synchronous rollback of config and companion bytes. This is not crash-safe or a filesystem lock. */
export function runConfigWriteTransaction(
  writes: readonly CompanionFileWrite[],
  shouldRestore: (path: string) => boolean,
): ConfigWriteOutcome {
  let snapshots: Map<string, FileSnapshot>;
  try {
    snapshots = new Map(writes.map(({ path }) => [path, snapshotFile(path)]));
  } catch (error) {
    return { status: 'failed', error, reverted: false };
  }
  const attempted = new Set<string>();
  try {
    for (const write of writes) {
      attempted.add(write.path);
      write.write();
    }
  } catch (error) {
    // Decide before restoring any file. If config now belongs to another writer, leave
    // companion files intact too: that config can still reference our carried file.
    let restorePaths: string[];
    try {
      restorePaths = [...attempted].reverse().filter(shouldRestore);
    } catch (restoreError) {
      attachRestoreFailure(error, [restoreError]);
      return { status: 'failed', error, reverted: false };
    }
    const failures: unknown[] = [];
    for (const path of restorePaths) {
      const snapshot = snapshots.get(path);
      if (snapshot?.contents === undefined) continue;
      try {
        if (snapshot.contents === null) {
          if (existsSync(path)) unlinkSync(path);
        } else {
          writeFileSync(path, snapshot.contents);
        }
      } catch (restoreError) {
        failures.push(restoreError);
      }
    }
    attachRestoreFailure(error, failures);
    return { status: 'failed', error, reverted: failures.length === 0 && restorePaths.length === attempted.size };
  }
  return { status: 'succeeded' };
}
