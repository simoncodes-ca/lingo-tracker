import { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

/**
 * Data passed to the Collection Form Dialog.
 */
export interface CollectionFormDialogData {
  /**
   * Dialog mode: 'create' for new collections, 'edit' for existing ones.
   */
  mode: 'create' | 'edit';

  /**
   * Collection name (only present in edit mode).
   */
  name?: string;

  /**
   * Collection configuration (only present in edit mode).
   */
  config?: LingoTrackerCollectionDto;
}
