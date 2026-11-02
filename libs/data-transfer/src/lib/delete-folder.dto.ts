/**
 * DTO for deleting a folder from the resource hierarchy.
 */
export interface DeleteFolderDto {
  /**
   * The dot-delimited folder path to delete (e.g., "apps.common.buttons").
   */
  folderPath: string;
}

/**
 * Response DTO for folder deletion operation.
 */
export interface DeleteFolderResponseDto {
  /** Always true: a failed deletion answers with an HTTP error instead (404 for a missing folder). */
  deleted: boolean;

  /** The dot-delimited folder path that was targeted for deletion */
  folderPath: string;

  /** Number of resource entries that were deleted with the folder */
  resourcesDeleted: number;
}
