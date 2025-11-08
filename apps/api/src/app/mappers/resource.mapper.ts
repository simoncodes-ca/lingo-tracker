import { AddResourceParams } from '@simoncodes-ca/core';
import { CreateResourceDto } from '@simoncodes-ca/data-transfer';

export function mapDtoToAddResourceParams(dto: CreateResourceDto): AddResourceParams {
  return {
    key: dto.key,
    baseValue: dto.baseValue,
    comment: dto.comment,
    tags: dto.tags,
    targetFolder: dto.targetFolder,
    baseLocale: dto.baseLocale,
    translations: dto.translations,
  };
}

