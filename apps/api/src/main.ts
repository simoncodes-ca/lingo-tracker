/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { join } from 'path';
import { createApp, GLOBAL_PREFIX, resolvePort } from './create-app';

async function bootstrap() {
  const clientPath = join(__dirname, '..', 'tracker', 'browser');
  const app = await createApp({ clientPath });
  const port = resolvePort(process.argv, process.env);
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`);
}

bootstrap();
