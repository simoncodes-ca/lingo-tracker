import { LingoTrackerCollectionDto } from './lingo-tracker-collection.dto';

export interface UpdateCollectionDto {
  /** Optional new collection name for renaming */
  name?: string;

  /** Updated collection configuration */
  collection: LingoTrackerCollectionDto;
}
