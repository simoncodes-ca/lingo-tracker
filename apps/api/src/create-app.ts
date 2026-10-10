import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app/app.module';

export const GLOBAL_PREFIX = 'api';
const DEFAULT_PORT = 3030;

interface CreateAppOptions {
  clientPath: string;
  /** Allows provider overrides while keeping the same Express adapter and application setup. */
  createNestApp?: (adapter: ExpressAdapter) => INestApplication | Promise<INestApplication>;
}

export async function createApp({ clientPath, createNestApp }: CreateAppOptions): Promise<INestApplication> {
  const server = express();

  // Serve Angular static files and SPA fallback before NestJS routes
  server.use(express.static(clientPath));
  server.get('{*splat}', (req, res, next) => {
    if (req.url.startsWith(`/${GLOBAL_PREFIX}`)) {
      return next();
    }
    res.sendFile('index.html', { root: clientPath });
  });

  const adapter = new ExpressAdapter(server);
  const app = createNestApp ? await createNestApp(adapter) : await NestFactory.create(AppModule, adapter);

  app.enableCors({
    origin: '*',
    methods: 'GET, PUT, POST, PATCH, DELETE',
    allowedHeaders: 'Content-Type, Authorization',
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

export function resolvePort(argv: readonly string[], env: NodeJS.ProcessEnv): number | string {
  const portArgIndex = argv.indexOf('--port');
  const portArgValue = portArgIndex !== -1 ? argv[portArgIndex + 1] : undefined;
  return portArgValue || env.LINGO_TRACKER_PORT || DEFAULT_PORT;
}
