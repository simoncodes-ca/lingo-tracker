import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { CorsOptionsCallback } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app/app.module';

export const GLOBAL_PREFIX = 'api';
const DEFAULT_PORT = 3030;
export const DEFAULT_HOST = '127.0.0.1';

class RootNotFoundExpressAdapter extends ExpressAdapter {
  override setNotFoundHandler(handler: express.RequestHandler): void {
    // Restore NestJS 11's root fallback while reusing Nest's exception handling. Dropping
    // the prefix and excluded routes is safe only while setGlobalPrefix has no `exclude`.
    super.setNotFoundHandler(handler);
  }
}

interface CreateAppOptions {
  clientPath: string;
  allowedHosts?: string;
  /** Allows provider overrides while keeping the same Express adapter and application setup. */
  createNestApp?: (adapter: ExpressAdapter) => INestApplication | Promise<INestApplication>;
}

export async function createApp({
  clientPath,
  allowedHosts = '',
  createNestApp,
}: CreateAppOptions): Promise<INestApplication> {
  const server = express();
  const namedHosts = new Set(
    allowedHosts
      .split(',')
      .map((name) => parseHostname(name.trim()))
      .filter((name): name is string => Boolean(name)),
  );

  server.use((req, res, next) => {
    if (isAllowedHost(req.headers.host, namedHosts) === false) {
      res.status(403).json({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
      return;
    }
    const origin = req.headers.origin;
    if (typeof origin === 'string' && isAllowedOrigin(origin, req.headers.host) === false) {
      res.status(403).json({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
      return;
    }
    next();
  });

  // Serve Angular static files and SPA fallback before NestJS routes
  server.use(express.static(clientPath));
  server.get('{*splat}', (req, res, next) => {
    if (req.url.startsWith(`/${GLOBAL_PREFIX}`)) {
      return next();
    }
    res.sendFile('index.html', { root: clientPath });
  });

  const adapter = new RootNotFoundExpressAdapter(server);
  const app = createNestApp ? await createNestApp(adapter) : await NestFactory.create(AppModule, adapter);

  // Let the Host middleware return a JSON 403 instead of Node's default bare 400 for a missing Host.
  const httpServer: { requireHostHeader: boolean } = app.getHttpServer();
  httpServer.requireHostHeader = false;

  app.enableCors((req: IncomingMessage, callback: CorsOptionsCallback) => {
    callback(null, {
      origin: isAllowedOrigin(req.headers.origin, req.headers.host),
      methods: 'GET, PUT, POST, PATCH, DELETE',
      allowedHeaders: 'Content-Type, Authorization',
    });
  });

  app.setGlobalPrefix(GLOBAL_PREFIX);

  const config = new DocumentBuilder()
    .setTitle('Lingo Tracker API')
    .setDescription('Endpoints Documentation')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(GLOBAL_PREFIX, app, document);

  return app;
}

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return false;
  try {
    const url = new URL(origin);
    const valid =
      origin.trim() === origin &&
      /^https?:\/\/[^/?#@\\\s,]+$/i.test(origin) &&
      url.username === '' &&
      url.password === '';
    if (valid === false) return false;
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.host.toLowerCase() === host?.toLowerCase();
    }
    return false;
  } catch {
    return false;
  }
}

function parseHostname(host: string): string | undefined {
  return /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::[0-9]+)?$/i.exec(host)?.[1]?.toLowerCase();
}

function isAllowedHost(host: string | undefined, namedHosts: ReadonlySet<string>): boolean {
  if (host === undefined) return false;
  const hostname = parseHostname(host);
  if (hostname === undefined) return false;
  // DNS rebinding needs a DNS name. IP literals are safe; named hosts must be listed explicitly.
  if (hostname.startsWith('[')) return isIP(hostname.slice(1, -1)) === 6;
  return hostname === 'localhost' || isIP(hostname) === 4 || namedHosts.has(hostname);
}

function resolveFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index < 0) return undefined;
  const argument = argv[index];
  const value = argument === flag ? argv[index + 1] : argument?.slice(flag.length + 1);
  return value?.startsWith('--') ? undefined : value;
}

export function resolvePort(argv: readonly string[], env: NodeJS.ProcessEnv): number | string {
  return resolveFlag(argv, '--port') || env.LINGO_TRACKER_PORT || DEFAULT_PORT;
}

export function resolveHost(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  return resolveFlag(argv, '--host') || env.LINGO_TRACKER_HOST || DEFAULT_HOST;
}
