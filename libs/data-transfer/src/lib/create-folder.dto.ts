/**
 * DTO for creating a new folder in the resource hierarchy.
 */
export interface CreateFolderDto {
  /**
   * The folder name (single segment).
   * Must contain only alphanumeric characters, dashes, or underscores.
   */
  folderName: string;

  /**
   * Optional dot-delimited parent path (e.g., "apps.common").
   * If not provided, folder is created at the root level.
   */
  parentPath?: string;
}

/**
 * Response DTO for folder creation operation.
 */
export interface CreateFolderResponseDto {
  /** Full dot-delimited path to the created folder */
  folderPath: string;

  /** Whether the folder was newly created (false if it already existed) */
  created: boolean;
}
