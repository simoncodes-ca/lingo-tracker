import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';

interface CollectionRequest {
  method: string;
  params: Record<string, string | undefined>;
}

/**
 * Blocks mutating requests (anything other than GET) against a read-only collection.
 *
 * Read requests always pass. For mutating requests, the collection named by the
 * `:collectionName` route param is looked up in config; if it is flagged `readOnly`,
 * a 403 is thrown. Unknown collections are allowed through so the controller can
 * return its own 404.
 *
 * Apply at controller level to the resources/locales/folders controllers. Do NOT
 * apply to the collections controller — editing or unregistering a collection's
 * config entry is permitted even when it is read-only.
 */
@Injectable()
export class WritableCollectionGuard implements CanActivate {
  readonly #configService: ConfigService;

  constructor(configService: ConfigService) {
    this.#configService = configService;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CollectionRequest>();

    if (request.method === 'GET') {
      return true;
    }

    const collectionName = decodeURIComponent(request.params['collectionName'] ?? '');
    if (!collectionName) {
      return true;
    }

    // Intentional independent read: the guarded controller will also call getConfig().
    // ConfigService is un-cached by design (config is a file that can change between
    // requests), so a fresh read here keeps the check correct. The cost is one extra
    // file read+parse on mutating requests only — negligible at this app's scale, and
    // not worth threading request-scoped state through every controller call site.
    const config = this.#configService.getConfig();
    const collection = config.collections?.[collectionName];

    if (collection?.readOnly) {
      throw new ForbiddenException(`Collection "${collectionName}" is read-only. Its resources cannot be modified.`);
    }

    return true;
  }
}
