export interface MoveResourceResponseDto {
  /** Number of resources successfully moved. */
  movedCount: number;
  /** Move diagnostics; API responses always include these arrays, even when empty. */
  warnings?: string[];
  /** Per-operation failures, including failures in a partially successful move. */
  errors?: string[];
}
