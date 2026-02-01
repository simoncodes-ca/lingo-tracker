/**
 * Status values for tree endpoint responses when cache is not ready.
 */
export type TreeStatusType = 'indexing' | 'not-ready';

/**
 * DTO for 202 Accepted responses when cache is not ready.
 * Returned by tree endpoint when collection is still being indexed.
 */
export interface TreeStatusResponseDto {
  /** Status indicating why tree is not available */
  status: TreeStatusType;

  /** Human-readable message describing the status */
  message: string;
}
