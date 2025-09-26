import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigService } from './config/config.service';

@Module({
  imports: [ServeStaticModule.forRoot({
    rootPath: join(__dirname, '..', 'tracker', 'browser'),
  }),],
  controllers: [AppController],
  providers: [AppService, ConfigService],
})
export class AppModule {
  constructor() {
    Logger.log('Lingo Tracker app is running in: ' + __dirname);
  }
}
