import { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

export interface CollectionWithName extends LingoTrackerCollectionDto {
  name: string;
  encodedName: string;
}
