import type { ResourceSummaryDto } from './resource-tree.dto';

export interface UpdateResourceResponseDto {
  resolvedKey: string;
  updated: boolean;
  message?: string;
  resource?: ResourceSummaryDto;
}
