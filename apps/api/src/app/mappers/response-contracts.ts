import type {
  AddLocaleToCollectionResult,
  DeleteFolderResult,
  DeleteResourceResult,
  MoveResult,
  RemoveLocaleFromCollectionResult,
  TerminologyFindings,
} from '@simoncodes-ca/core';
import type {
  AddLocaleResponseDto,
  DeleteFolderResponseDto,
  DeleteResourceResponseDto,
  MoveFolderResponseDto,
  MoveResourceResponseDto,
  RemoveLocaleResponseDto,
  ResourceTreeDto,
  TerminologyFindingsDto,
  TreeStatusResponseDto,
} from '@simoncodes-ca/data-transfer';

import type { TreeRead } from '../cache/collection-index.service';
import type { TreeAnswer, TreePendingStatus } from './tree-response.mapper';

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;
type DeepReadonly<Value> = { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> };

/**
 * API typecheck guards payload equality without making core depend on HTTP contracts.
 * Locale results pass through unchanged; controllers project away the named internal fields.
 * Readonly normalizes locale result mutability; Required reflects always-present move diagnostics.
 */
export type ResponseContractChecks = [
  Assert<Equal<TreeAnswer['body'], ResourceTreeDto | TreeStatusResponseDto>>,
  Assert<Equal<Exclude<TreeRead['status'], 'ready'>, TreePendingStatus>>,
  Assert<Equal<Readonly<AddLocaleToCollectionResult>, Readonly<AddLocaleResponseDto>>>,
  Assert<Equal<Readonly<RemoveLocaleFromCollectionResult>, Readonly<RemoveLocaleResponseDto>>>,
  Assert<Equal<Omit<DeleteResourceResult, 'outcome' | 'warnings'>, DeleteResourceResponseDto>>,
  Assert<Equal<Readonly<DeleteFolderResult>, Readonly<Omit<DeleteFolderResponseDto, 'deleted'>>>>,
  Assert<Equal<DeepReadonly<TerminologyFindings>, DeepReadonly<TerminologyFindingsDto>>>,
  Assert<Equal<Omit<MoveFolderResponseDto, 'foldersDeleted'>, Required<MoveResourceResponseDto>>>,
  Assert<
    Equal<
      Readonly<Required<Pick<MoveResult, 'foldersDeleted'>>>,
      Readonly<Pick<MoveFolderResponseDto, 'foldersDeleted'>>
    >
  >,
  Assert<Equal<Omit<MoveResult, 'outcome' | 'foldersDeleted'>, Required<MoveResourceResponseDto>>>,
];
