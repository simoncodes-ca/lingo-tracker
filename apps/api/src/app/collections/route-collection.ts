import { createParamDecorator, type ExecutionContext, Injectable, type PipeTransform } from '@nestjs/common';
import { type OpenedCollection, openCollection } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';

export interface RouteCollectionOptions {
  readonly writable?: boolean;
  readonly lifecycle?: 'update' | 'delete';
}

interface RouteCollectionRef {
  readonly name: string;
  readonly writable: boolean;
  readonly lifecycle?: 'update' | 'delete';
}

export function routeCollectionRef(
  options: RouteCollectionOptions,
  request: { method: string; params: Record<string, string | undefined> },
): RouteCollectionRef {
  return {
    name: request.params.collectionName ?? '',
    writable: options.writable ?? (options.lifecycle ? false : request.method !== 'GET'),
    ...(options.lifecycle && { lifecycle: options.lifecycle }),
  };
}

export const RouteCollection = (options: RouteCollectionOptions = {}) =>
  createParamDecorator((data: RouteCollectionOptions, context: ExecutionContext): RouteCollectionRef => {
    const request = context.switchToHttp().getRequest<{ method: string; params: Record<string, string | undefined> }>();
    return routeCollectionRef(data, request);
  })(options, RouteCollectionPipe);

@Injectable()
export class RouteCollectionPipe implements PipeTransform<RouteCollectionRef, OpenedCollection> {
  readonly #configService: ConfigService;

  constructor(
    configService: ConfigService,
    private readonly index: CollectionIndex,
  ) {
    this.#configService = configService;
  }

  transform({ name, writable, lifecycle }: RouteCollectionRef): OpenedCollection {
    const reportsMutations = writable || lifecycle !== undefined;
    return openCollection(this.#configService.getConfig(), name, {
      cwd: this.#configService.projectRoot,
      writable,
      onMutation: reportsMutations ? this.index.sink : undefined,
      forDeletion: lifecycle === 'delete',
    });
  }
}
