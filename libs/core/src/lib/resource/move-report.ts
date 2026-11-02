import type { RunOutcome } from '../run-outcome';
import type { MovePruneResult } from './move-cleanup';
import type { RelocationResult } from './relocate-entries';

export interface MoveResult {
  readonly outcome: RunOutcome;
  /** Number of source folders removed; present for folder selections and batches containing them. */
  readonly foldersDeleted?: number;
  movedCount: number;
  warnings: string[];
  errors: string[];
}

/** Accumulates completed moves; malformed input is thrown before reporting. */
export class MoveReport {
  private movedCount = 0;
  private readonly warnings: string[] = [];
  private readonly errors: string[] = [];
  private foldersDeleted = 0;

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  merge(result: RelocationResult | MoveResult): void {
    if ('moved' in result) {
      this.movedCount += result.moved.length;
      this.warnings.push(...(result.warnings ?? []));
      for (const { to } of result.collisions) {
        this.warn(`Destination key already exists: ${to}. Use override option to force move.`);
      }
    } else {
      this.movedCount += result.movedCount;
      this.foldersDeleted += result.foldersDeleted ?? 0;
      this.warnings.push(...result.warnings);
    }
    this.errors.push(...result.errors);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  fail(message: string): void {
    this.errors.push(message);
  }

  /** Cleanup already owns source counting and diagnostic policy. */
  prune(result: MovePruneResult): void {
    this.foldersDeleted += result.foldersDeleted;
    this.warnings.push(...result.warnings);
    this.errors.push(...result.errors);
  }

  finish(): MoveResult;
  finish(folder: true): MoveResult & { foldersDeleted: number };
  finish(folder?: true): MoveResult & { foldersDeleted?: number } {
    return {
      movedCount: this.movedCount,
      warnings: [...this.warnings],
      errors: [...this.errors],
      outcome: this.hasErrors ? 'failed' : 'succeeded',
      ...(folder ? { foldersDeleted: this.foldersDeleted } : {}),
    };
  }
}
