/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { join } from 'path';
import { createApp, GLOBAL_PREFIX, resolveHost, resolvePort } from './create-app';

async function bootstrap() {
  const clientPath = join(__dirname, '..', 'tracker', 'browser');
  const port = resolvePort(process.argv, process.env);
  const host = resolveHost(process.argv, process.env);
  const app = await createApp({ clientPath, allowedHosts: process.env.LINGO_TRACKER_ALLOWED_HOSTS });
  await app.listen(port, host);
  const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  Logger.log(`🚀 Application is running on: http://${displayHost}:${port}/${GLOBAL_PREFIX}`);
}

bootstrap();
