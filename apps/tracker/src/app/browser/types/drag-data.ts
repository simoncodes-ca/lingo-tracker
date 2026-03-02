/**
 * Represents data carried during drag-and-drop operations.
 * Used to identify what is being dragged (resource or folder) and its location.
 */
export interface DragData {
  /** Type of the dragged item */
  type: 'resource' | 'folder';

  /** Full resource key (only for resources) */
  key?: string;

  /** Full folder path (only for folders) */
  path?: string;

  /** Current folder path containing the resource (only for resources) */
  folderPath?: string;
}
