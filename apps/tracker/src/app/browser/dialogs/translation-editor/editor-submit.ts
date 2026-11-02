import { computed, signal } from '@angular/core';
import type {
  CreateResourceDto,
  CreateResourceResponseDto,
  ResourceSummaryDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';
import { type AppRuntime, resolveResourceKey } from '@simoncodes-ca/domain';
import { catchError, firstValueFrom, map, type Observable, of } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { ApiError } from '../../../shared/api-error/api-error';
import type { Feedback } from '../../feedback';
import { doesUpdateMoveEntry } from '../../store/does-update-move-entry';
import { refusedFeedback } from '../../store/write-refusal';
import type { EditorFocusTarget } from './editor-focus';
import {
  type ResourceEntryDraft,
  resolveDraftKey,
  toCreateDto,
  toUpdateDto,
  type UnrenderableWrite,
  unrenderableWrites,
} from './resource-entry-draft';

/** The result consumed by the launcher, including the conflict hand-off owned by the dialog. */
export type EditorOutcome =
  | { kind: 'saved'; fullKey: string; skippedLocales: string[] }
  | { kind: 'moved'; fullKey: string; folderPath: string; skippedLocales: string[] }
  | { kind: 'created'; fullKey: string; skippedLocales: string[] }
  | { kind: 'open-existing'; fullKey: string }
  | { kind: 'cancelled' };

export type EditorRefusal =
  | { kind: 'conflict'; key: string; error: ApiError }
  | { kind: 'not-found'; error: ApiError }
  | { kind: 'invalid'; message: string | undefined; error: ApiError }
  | { kind: 'create-failed'; error: ApiError }
  | { kind: 'update-failed'; error: ApiError }
  | { kind: 'unexpected'; error: unknown }
  | { kind: 'missing-original' };

/** Distinguishes a write refusal from an outcome without listing outcome kinds in the dialog. */
export function isEditorRefusal(result: unknown): result is EditorRefusal {
  if (typeof result !== 'object' || result === null || !('kind' in result)) return false;
  const kind = result.kind;
  return (
    kind === 'conflict' ||
    kind === 'not-found' ||
    kind === 'invalid' ||
    kind === 'create-failed' ||
    kind === 'update-failed' ||
    kind === 'unexpected' ||
    kind === 'missing-original'
  );
}

export interface EditorWrites {
  create: (dto: CreateResourceDto) => Observable<CreateResourceResponseDto>;
  update: (dto: UpdateResourceDto) => Observable<UpdateResourceResponseDto>;
}

export interface EditorSubmitInput {
  mode: 'create' | 'edit';
  draft: ResourceEntryDraft;
  original?: ResourceSummaryDto;
  writes: EditorWrites;
}

/** Submit rules and response mapping, independent of the dialog and store instance. */
export function submitEditor({
  mode,
  draft,
  original,
  writes,
}: EditorSubmitInput): Observable<EditorOutcome | EditorRefusal> {
  if (mode === 'create') {
    const dto = toCreateDto(draft);
    return writes.create(dto).pipe(
      catchError((error: unknown) => of(classifyEditorError('create', error, dto.key))),
      map((response): EditorOutcome | EditorRefusal =>
        isEditorRefusal(response)
          ? response
          : { kind: 'created', fullKey: dto.key, skippedLocales: response.skippedLocales ?? [] },
      ),
    );
  }

  if (!original) return of({ kind: 'missing-original' });

  const dto = toUpdateDto(draft, original);
  return writes.update(dto).pipe(
    catchError((error: unknown) => of(classifyEditorError('edit', error, dto.key))),
    map((response): EditorOutcome | EditorRefusal => {
      if (isEditorRefusal(response)) return response;
      const skippedLocales = response.skippedLocales ?? [];
      if (doesUpdateMoveEntry(dto)) {
        return {
          kind: 'moved',
          fullKey: resolveResourceKey(original.entryKey, dto.moveTo),
          folderPath: dto.moveTo,
          skippedLocales,
        };
      }
      return response.updated ? { kind: 'saved', fullKey: original.fullKey, skippedLocales } : { kind: 'cancelled' };
    }),
  );
}

/** One classifier for both write operations. Presentation remains in the dialog. */
export function classifyEditorError(mode: EditorSubmitInput['mode'], error: unknown, key: string): EditorRefusal {
  if (!(error instanceof ApiError)) return { kind: 'unexpected', error };
  if (error.kind === 'conflict' && mode === 'create') return { kind: 'conflict', key, error };
  if (error.kind === 'not-found' && mode === 'edit') return { kind: 'not-found', error };
  if (error.kind === 'invalid') return { kind: 'invalid', message: error.serverMessage, error };
  return mode === 'create' ? { kind: 'create-failed', error } : { kind: 'update-failed', error };
}

interface EditorGateState {
  readOnly: boolean;
  validation: EditorValidationState;
  collision: boolean;
  needsUnrenderableConfirmation: boolean;
}

type EditorGateReason = 'read-only' | 'invalid' | 'collision' | 'needs-unrenderable-confirmation';

/** The first reason to stop submission before the confirmations; the comment prompt follows the others. */
function submitGate(state: EditorGateState): EditorGateReason | null {
  if (state.readOnly) return 'read-only';
  if (state.validation.invalid) return 'invalid';
  if (state.collision) return 'collision';
  if (state.needsUnrenderableConfirmation) return 'needs-unrenderable-confirmation';
  return null;
}

export type EditorSubmitPhase =
  | 'idle'
  | 'confirming-unrenderable'
  | 'confirming-comment'
  | 'choosing-conflict'
  | 'writing'
  | 'done';

/** Focus and panel changes chosen with the submit outcome. */
export interface EditorReveal {
  focus: EditorFocusTarget;
  panels: 'close-all' | 'locales' | 'keep';
}

export type EditorValidationState =
  | { invalid: false }
  | { invalid: true; keyInvalid: boolean; baseValueInvalid: boolean; firstInvalidLocaleIndex: number };

function validationReveal(state: Extract<EditorValidationState, { invalid: true }>): EditorReveal {
  if (!state.keyInvalid && !state.baseValueInvalid && state.firstInvalidLocaleIndex >= 0) {
    return { focus: 'invalid-locale-value', panels: 'locales' };
  }
  return { focus: state.keyInvalid ? 'key' : 'base-value', panels: 'close-all' };
}

export type EditorSubmitDecision =
  | { kind: 'ignored' }
  | { kind: 'invalid'; reveal: EditorReveal }
  | { kind: 'reveal'; reveal: EditorReveal }
  | { kind: 'message'; feedback: Feedback }
  | { kind: 'outcome'; outcome: EditorOutcome };

export interface EditorSubmitSessionOptions {
  writes: EditorWrites;
  confirmUnrenderable: (findings: readonly UnrenderableWrite[]) => Promise<boolean>;
  confirmMissingComment: () => Promise<boolean>;
  chooseConflict: (fullKey: string) => Promise<boolean>;
  onWriteStart: () => void;
}

export interface EditorSubmitTrigger extends Omit<EditorSubmitInput, 'writes'> {
  validation: EditorValidationState;
  readOnly: boolean;
  collision: boolean;
  runtime: AppRuntime;
  baseLocale: string;
}

/** A stable identity for a set of findings, values included, so one acknowledgement covers exactly those values. */
function findingsSignature(findings: readonly UnrenderableWrite[]): string {
  return JSON.stringify(findings.map(({ locale, kinds, value }) => [locale, kinds, value]));
}

/** Owns one save attempt from its first prompt through the final write or hand-off. */
export class EditorSubmitSession {
  readonly phase = signal<EditorSubmitPhase>('idle');
  readonly isSubmitting = computed(() => this.phase() === 'writing' || this.phase() === 'done');
  #saveAnyway = false;
  readonly #acknowledgedFindings = new Set<string>();

  constructor(readonly options: EditorSubmitSessionOptions) {}

  async trigger(input: EditorSubmitTrigger): Promise<EditorSubmitDecision> {
    if (this.phase() !== 'idle') return { kind: 'ignored' };

    const findings = unrenderableWrites(
      input.draft,
      input.mode === 'edit' ? input.original : undefined,
      input.baseLocale,
      input.runtime,
    );
    const signature = findingsSignature(findings);

    const gate = submitGate({
      readOnly: input.readOnly,
      validation: input.validation,
      collision: input.collision,
      needsUnrenderableConfirmation: findings.length > 0 && !this.#acknowledgedFindings.has(signature),
    });
    if (gate === 'read-only') return { kind: 'ignored' };
    if (input.validation.invalid) return { kind: 'invalid', reveal: validationReveal(input.validation) };

    try {
      if (gate === 'collision') return await this.#chooseConflict(resolveDraftKey(input.draft));
      if (gate === 'needs-unrenderable-confirmation') {
        this.phase.set('confirming-unrenderable');
        if (!(await this.options.confirmUnrenderable(findings)))
          return { kind: 'reveal', reveal: unrenderableReveal(findings, input.baseLocale) };
        this.#acknowledgedFindings.add(signature);
      }
      if (!input.draft.comment.trim() && !this.#saveAnyway) {
        this.phase.set('confirming-comment');
        if (!(await this.options.confirmMissingComment()))
          return { kind: 'reveal', reveal: { focus: 'comment', panels: 'keep' } };
        this.#saveAnyway = true;
      }

      this.phase.set('writing');
      this.options.onWriteStart();
      const result = await firstValueFrom(submitEditor({ ...input, writes: this.options.writes }));
      if (isEditorRefusal(result)) {
        if (result.kind === 'conflict') return await this.#chooseConflict(result.key);
        return refusalDecision(result);
      }

      this.phase.set('done');
      return { kind: 'outcome', outcome: result };
    } catch {
      return messageDecision(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UNEXPECTED);
    } finally {
      if (this.phase() !== 'done') this.phase.set('idle');
    }
  }

  async #chooseConflict(fullKey: string): Promise<EditorSubmitDecision> {
    this.phase.set('choosing-conflict');
    if (!(await this.options.chooseConflict(fullKey))) return { kind: 'ignored' };
    this.phase.set('done');
    return { kind: 'outcome', outcome: { kind: 'open-existing', fullKey } };
  }
}

/** A flagged base value is focused; otherwise the flagged locale rows are already showing their advisory. */
function unrenderableReveal(findings: readonly UnrenderableWrite[], baseLocale: string): EditorReveal {
  return findings.some(({ locale }) => locale === baseLocale)
    ? { focus: 'base-value', panels: 'close-all' }
    : { focus: 'drawer-first-control', panels: 'locales' };
}

function messageDecision(token: string, error?: ApiError): Extract<EditorSubmitDecision, { kind: 'message' }> {
  return { kind: 'message', feedback: refusedFeedback(error, token, 'inline') };
}

/** Refusals carry their wording and tone; the dialog only renders the feedback. */
export function refusalDecision(refusal: Exclude<EditorRefusal, { kind: 'conflict' }>): EditorSubmitDecision {
  const tokens = TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR;
  switch (refusal.kind) {
    case 'missing-original':
      return messageDecision(tokens.MISSINGRESOURCE);
    case 'not-found':
      return messageDecision(tokens.NOTFOUND);
    case 'invalid':
      return messageDecision(tokens.INVALIDREQUEST, refusal.error);
    case 'create-failed':
      return messageDecision(tokens.CREATEFAILED, refusal.error);
    case 'update-failed':
      return messageDecision(tokens.UPDATEFAILED, refusal.error);
    case 'unexpected':
      return messageDecision(tokens.UNEXPECTED);
  }
}
