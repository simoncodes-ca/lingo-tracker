import type { Collection } from '@simoncodes-ca/core';
import type { ResourceTreeDto, TreeStatusResponseDto } from '@simoncodes-ca/data-transfer';
import type { TreeRead } from '../cache/collection-index.service';
import { mapGetTreeResultToDto } from './resource-tree.mapper';

export type TreePendingStatus = 'indexing' | 'not-started' | 'error';
export type TreeAnswer = { httpStatus: 200; body: ResourceTreeDto } | { httpStatus: 202; body: TreeStatusResponseDto };

/** Describes the HTTP answer for an index read. The controller handles missing paths. */
export function describeTreeRead(
  read: TreeRead,
  collection: Collection,
  includeNested: string | undefined,
): TreeAnswer {
  if (read.status === 'ready') {
    if (!read.tree) throw new Error('A ready tree read must contain a tree');
    return { httpStatus: 200, body: mapGetTreeResultToDto(read.tree, collection, includeNested) };
  }
  return { httpStatus: 202, body: describePendingStatus(read.status) };
}

function describePendingStatus(status: TreePendingStatus): TreeStatusResponseDto {
  return status === 'indexing'
    ? { status: 'indexing', message: 'Collection is currently being indexed. Please try again shortly.' }
    : {
        status: 'not-ready',
        message:
          status === 'error'
            ? 'Cache indexing failed, re-indexing collection. Please try again shortly.'
            : 'Collection indexing started. Please try again shortly.',
      };
}
