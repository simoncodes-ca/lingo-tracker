import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BundleJobService } from './bundles/bundle-job.service';
import { BundlesController } from './bundles/bundles.controller';
import { CollectionIndex } from './cache/collection-index.service';
import { CollectionsController } from './collections/collections.controller';
import { FoldersController } from './collections/folders/folders.controller';
import { LocalesController } from './collections/locales/locales.controller';
import { ResourcesController } from './collections/resources/resources.controller';
import { RouteCollectionPipe } from './collections/route-collection';
import { ConfigController } from './config/config.controller';
import { ConfigService } from './config/config.service';
import { RouteProjectPipe } from './config/route-project';
import { LingoTrackerExceptionFilter } from './errors/lingo-tracker-exception.filter';
import { ExportJobService } from './exports/export-job.service';
import { ExportsController } from './exports/exports.controller';
import { ImportJobService } from './imports/import-job.service';
import { ImportSourceService } from './imports/import-source.service';
import { ImportUploadService } from './imports/import-upload.service';
import { ImportsController } from './imports/imports.controller';
import { TranslationJobService } from './translation-job/translation-job.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    ConfigController,
    CollectionsController,
    ResourcesController,
    FoldersController,
    LocalesController,
    BundlesController,
    ExportsController,
    ImportsController,
  ],
  providers: [
    AppService,
    ConfigService,
    RouteCollectionPipe,
    RouteProjectPipe,
    CollectionIndex,
    TranslationJobService,
    BundleJobService,
    ExportJobService,
    ImportJobService,
    ImportSourceService,
    ImportUploadService,
    Logger,
    { provide: APP_FILTER, useClass: LingoTrackerExceptionFilter },
  ],
})
export class AppModule {
  constructor() {
    Logger.log(`Lingo Tracker app is running in: ${__dirname}`);
  }
}
