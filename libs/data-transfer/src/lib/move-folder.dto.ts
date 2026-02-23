/**
 * DTO for moving a folder within the resource hierarchy.
 */
export interface MoveFolderDto {
  /**
   * The dot-delimited source folder path (e.g., "apps.common.buttons").
   */
  sourceFolderPath: string;

  /**
   * The dot-delimited destination folder path (e.g., "apps.shared").
   * Resources will be moved to this destination, preserving their structure.
   * For example: "apps.common.buttons.ok" becomes "apps.shared.buttons.ok"
   */
  destinationFolderPath: string;

  /**
   * If true, override existing resources at destination with same keys.
   * Default is false.
   */
  override?: boolean;

  /**
   * Optional destination collection name for cross-collection moves.
   * If not specified, resources are moved within the same collection.
   */
  toCollection?: string;

  /**
   * When true, the source folder is nested under the destination as a child folder.
   * When false, uses depth-based rename/nest heuristic (legacy behavior).
   * Default: true
   */
  nestUnderDestination?: boolean;
}

/**
 * Response DTO for folder move operation.
 */
export interface MoveFolderResponseDto {
  /** Number of resources successfully moved */
  movedCount: number;

  /** Number of folders deleted after move (usually 1 for source folder) */
  foldersDeleted: number;

  /** Warning messages encountered during the move */
  warnings: string[];

  /** Error messages if the move failed or partially failed */
  errors: string[];
}
