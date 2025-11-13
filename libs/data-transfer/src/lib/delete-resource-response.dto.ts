/**
 * DTO for the response when deleting one or more resource entries.
 */
export interface DeleteResourceResponseDto {
  /** Number of resource entries successfully deleted */
  entriesDeleted: number;
  /** Optional array of errors for entries that failed to delete */
  errors?: Array<{
    /** The key that failed to delete */
    key: string;
    /** Error message describing why the deletion failed */
    error: string;
  }>;
}