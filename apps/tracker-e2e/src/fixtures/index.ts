import { test as base } from '@playwright/test';
import { AppHeader } from '../pages/app-header';
import { BrowserPage } from '../pages/browser.page';
import { BundleFormDialog } from '../pages/bundle-form-dialog';
import { BundlesPage } from '../pages/bundles.page';
import { CollectionsPage } from '../pages/collections.page';
import { ExportDialog } from '../pages/export-dialog';
import { ImportDialog } from '../pages/import-dialog';
import { SettingsPage } from '../pages/settings.page';
import { TranslationEditorDialog } from '../pages/translation-editor-dialog';
import { networkGuardFixture } from './network';
import { type Project, projectFixture } from './project';
import { type Server, serverFixture } from './server';

interface TestFixtures {
  bundleFormDialog: BundleFormDialog;
  bundlesPage: BundlesPage;
  exportDialog: ExportDialog;
  importDialog: ImportDialog;
  project: Project;
  browserPage: BrowserPage;
  translationEditor: TranslationEditorDialog;
  settingsPage: SettingsPage;
  appHeader: AppHeader;
  collectionsPage: CollectionsPage;
  networkGuard: undefined;
}

interface WorkerFixtures {
  server: Server;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  server: [serverFixture, { scope: 'worker', timeout: 45_000 }],
  baseURL: async ({ server }, use) => {
    await use(server.baseURL);
  },
  bundleFormDialog: async ({ page }, use) => {
    await use(new BundleFormDialog(page));
  },
  bundlesPage: async ({ page }, use) => {
    await use(new BundlesPage(page));
  },
  exportDialog: async ({ page }, use) => {
    await use(new ExportDialog(page));
  },
  importDialog: async ({ page }, use) => {
    await use(new ImportDialog(page));
  },
  project: projectFixture,
  browserPage: async ({ page }, use) => {
    await use(new BrowserPage(page));
  },
  translationEditor: async ({ page }, use) => {
    await use(new TranslationEditorDialog(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
  appHeader: async ({ page }, use) => {
    await use(new AppHeader(page));
  },
  networkGuard: [networkGuardFixture, { auto: true }],
  collectionsPage: async ({ page }, use) => {
    await use(new CollectionsPage(page));
  },
});

export { expect } from '@playwright/test';
