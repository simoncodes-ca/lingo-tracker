import { createParamDecorator, type ExecutionContext, Injectable, type PipeTransform } from '@nestjs/common';
import type { OpenedProject } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { routeCollectionRef } from '../collections/route-collection';
import { ConfigService } from './config.service';

export const RouteProject = () =>
  createParamDecorator((_data: unknown, context: ExecutionContext): boolean => {
    const request = context.switchToHttp().getRequest<{ method: string; params: Record<string, string | undefined> }>();
    return routeCollectionRef({}, request).writable;
  })(undefined, RouteProjectPipe);

@Injectable()
export class RouteProjectPipe implements PipeTransform<boolean, OpenedProject> {
  constructor(
    private readonly configService: ConfigService,
    private readonly index: CollectionIndex,
  ) {}

  transform(writable: boolean): OpenedProject {
    const configService = this.configService;
    let project: OpenedProject | undefined;
    // sourceConfig is read lazily on first access within the request.
    return {
      projectRoot: configService.projectRoot,
      onMutation: writable ? this.index.sink : undefined,
      get sourceConfig() {
        project ??= configService.openProject();
        return project.sourceConfig;
      },
    };
  }
}
