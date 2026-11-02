import type { UpdateResourceDto } from '@simoncodes-ca/data-transfer';

/** The presence of a destination, including the collection root, means a move. */
export function doesUpdateMoveEntry(dto: UpdateResourceDto): dto is UpdateResourceDto & { moveTo: string } {
  return dto.moveTo !== undefined;
}
