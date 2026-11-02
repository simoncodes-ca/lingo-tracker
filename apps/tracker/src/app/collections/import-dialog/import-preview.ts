import type { ImportPlanDto, ImportRequestDto } from '@simoncodes-ca/data-transfer';
import { DryRunPreview, type DryRunPreviewOptions } from '../shared/dry-run-preview';

export type ImportPreviewOptions = DryRunPreviewOptions<ImportRequestDto, ImportPlanDto>;

export class ImportPreview extends DryRunPreview<ImportRequestDto, ImportPlanDto> {}
