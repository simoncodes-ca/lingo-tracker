export interface MoveOperationDto {
  source: string;
  destination: string;
  override?: boolean;
  toCollection?: string;
}

export interface MoveResourceDto {
  moves: MoveOperationDto[];
}
