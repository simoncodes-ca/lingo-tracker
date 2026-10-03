import { Controller, Delete, Param, Post } from '@nestjs/common';
import { addLocaleToCollection, type OpenedCollection, removeLocaleFromCollection } from '@simoncodes-ca/core';
import type { AddLocaleDto, AddLocaleResponseDto, RemoveLocaleResponseDto } from '@simoncodes-ca/data-transfer';
import { RouteCollection } from '../route-collection';
import { addLocaleBody } from '../../validation/dto-schemas';
import { ValidBody } from '../../validation/valid-body';

/**
 * Core locale errors (invalid, missing, duplicate, base locale; read-only collection)
 * propagate to `LingoTrackerExceptionFilter`, which answers 400 / 403 / 404.
 */
@Controller('collections/:collectionName/locales')
export class LocalesController {
  @Post()
  async addLocale(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(addLocaleBody) body: AddLocaleDto,
  ): Promise<AddLocaleResponseDto> {
    const response = await addLocaleToCollection(collection, body.locale);

    return response;
  }

  @Delete(':locale')
  async removeLocale(
    @RouteCollection() collection: OpenedCollection,
    @Param('locale') locale: string,
  ): Promise<RemoveLocaleResponseDto> {
    const response = await removeLocaleFromCollection(collection, locale);

    return response;
  }
}
