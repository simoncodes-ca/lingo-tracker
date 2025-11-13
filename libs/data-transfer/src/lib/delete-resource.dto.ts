/**
 * DTO for deleting one or more translation resource entries.
 */
export interface DeleteResourceDto {
  /** Array of full dot-delimited keys (e.g., ["apps.common.buttons.ok", "apps.common.buttons.cancel"]) */
  keys: string[];
}