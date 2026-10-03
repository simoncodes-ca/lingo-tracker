import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type PipeTransform,
} from '@nestjs/common';
import {
  CollectionNotFoundError,
  type OpenedCollection,
  openCollection,
  ReadOnlyCollectionError,
} from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';

export interface RouteCollectionOptions {
  readonly writable?: boolean;
}

interface RouteCollectionRef {
  readonly name: string;
  readonly writable: boolean;
}

export function routeCollectionRef(
  options: RouteCollectionOptions,
  request: { method: string; params: Record<string, string | undefined> },
): RouteCollectionRef {
  return { name: request.params.collectionName ?? '', writable: options.writable ?? request.method !== 'GET' };
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

  transform({ name, writable }: RouteCollectionRef): OpenedCollection {
    try {
      return openCollection(this.#configService.getConfig(), name, {
        writable,
        onMutation: writable ? this.index.sink : undefined,
      });
    } catch (error) {
      // Route pipes also run in modules without the app-level exception filter.
      if (error instanceof CollectionNotFoundError) throw new NotFoundException(`Collection "${name}" not found`);
      if (error instanceof ReadOnlyCollectionError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
