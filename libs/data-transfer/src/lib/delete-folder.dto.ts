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
  /** Whether the folder was successfully deleted */
  deleted: boolean;

  /** The dot-delimited folder path that was targeted for deletion */
  folderPath: string;

  /** Number of resource entries that were deleted with the folder */
  resourcesDeleted: number;

  /** Error message if deletion failed */
  error?: string;
}
