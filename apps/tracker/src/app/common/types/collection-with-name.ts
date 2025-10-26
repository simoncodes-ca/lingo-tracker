import { LingoTrackerCollection } from '@simoncodes-ca/core';

export interface CollectionWithName extends LingoTrackerCollection {
  name: string;
  encodedName: string;
}
