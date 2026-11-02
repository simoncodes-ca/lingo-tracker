import { join } from 'node:path';
import { expect, test } from './fixtures';
import { readConfig, readOutput } from './fixtures/disk';

test('creates a bundle in the dialog and persists its definition in config', async ({
  project,
  server,
  collectionsPage,
  bundlesPage,
  bundleFormDialog,
}) => {
  await project.addCollection();
  const output = join(project.artifactsFolder, 'bundle');
  await collectionsPage.goto();
  await bundlesPage.openCreate();
  await bundleFormDialog.create(project.collectionName, output);
  await expect(bundleFormDialog.dialog).toBeHidden();
  await expect(bundlesPage.bundle(project.collectionName)).toBeVisible();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).bundles?.[project.collectionName])
    .toEqual({
      dist: output,
      bundleName: '{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: 'All' }],
    });
});

test('deletes a seeded bundle after confirmation and removes its definition from config', async ({
  project,
  server,
  collectionsPage,
  bundlesPage,
}) => {
  await project.addCollection();
  await project.addBundle({
    name: project.collectionName,
    bundle: {
      dist: join(project.artifactsFolder, 'bundle'),
      bundleName: '{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: 'All' }],
    },
  });
  await collectionsPage.goto();
  await expect(bundlesPage.bundle(project.collectionName)).toBeVisible();
  await bundlesPage.delete(project.collectionName);
  await expect(bundlesPage.deleteDialog).toBeHidden();
  await expect(bundlesPage.bundle(project.collectionName)).toBeHidden();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).bundles ?? {})
    .not.toHaveProperty(project.collectionName);
});

test('generates a bundle through its card and writes per-locale resources on disk', async ({
  project,
  collectionsPage,
  bundlesPage,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour', status: 'translated' }],
  });
  const output = join(project.artifactsFolder, 'bundle');
  await project.addBundle({
    name: project.collectionName,
    bundle: {
      dist: output,
      bundleName: '{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: 'All' }],
    },
  });
  await collectionsPage.goto();
  await bundlesPage.generate(project.collectionName);
  await expect(bundlesPage.runStatus(project.collectionName)).toContainText('Generated');
  await expect.poll(() => readOutput(join(output, 'en.json'))).toEqual({ common: { greeting: 'Hello' } });
  await expect.poll(() => readOutput(join(output, 'fr-ca.json'))).toEqual({ common: { greeting: 'Bonjour' } });
});

test('edits a seeded bundle in the dialog and persists its updated definition in config', async ({
  project,
  server,
  collectionsPage,
  bundlesPage,
  bundleFormDialog,
}) => {
  await project.addCollection();
  await project.addBundle({
    name: project.collectionName,
    bundle: {
      dist: join(project.artifactsFolder, 'bundle'),
      bundleName: '{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: 'All' }],
    },
  });
  await collectionsPage.goto();
  await bundlesPage.edit(project.collectionName);
  const output = join(project.artifactsFolder, 'edited-bundle');
  await bundleFormDialog.edit(output, 'app.{locale}');
  await expect(bundleFormDialog.dialog).toBeHidden();
  await expect(bundlesPage.bundle(project.collectionName)).toBeVisible();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).bundles?.[project.collectionName])
    .toEqual({
      dist: output,
      bundleName: 'app.{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: 'All' }],
    });
});

test('creates a tag-filtered bundle in the dialog and generates only tagged resources', async ({
  project,
  server,
  collectionsPage,
  bundlesPage,
  bundleFormDialog,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    tags: ['release'],
    translations: [{ locale: 'fr-ca', value: 'Bonjour' }],
  });
  await project.addResource({
    key: 'other.farewell',
    baseValue: 'Goodbye',
    tags: ['release'],
    translations: [{ locale: 'fr-ca', value: 'Au revoir' }],
  });
  await project.addResource({
    key: 'common.draft',
    baseValue: 'Draft',
    tags: ['wip'],
    translations: [{ locale: 'fr-ca', value: 'Brouillon' }],
  });
  const output = join(project.artifactsFolder, 'tag-bundle');
  await collectionsPage.goto();
  await bundlesPage.openCreate();
  await bundleFormDialog.fillOutput(project.collectionName, output);
  await bundleFormDialog.setSelectionRule('*', 'release');
  await expect(bundleFormDialog.matchingRules).toBeChecked();
  await expect(bundleFormDialog.dryRun).toContainText(/≈ 2(?!\d)/);
  await expect(bundleFormDialog.exampleKey).toContainText('common.greeting');
  await bundleFormDialog.submit();
  await expect(bundleFormDialog.dialog).toBeHidden();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).bundles?.[project.collectionName])
    .toEqual({
      dist: output,
      bundleName: '{locale}',
      collections: [
        {
          name: project.collectionName,
          entriesSelectionRules: [{ matchingPattern: '*', matchingTags: ['release'], matchingTagOperator: 'Any' }],
        },
      ],
    });
  await bundlesPage.generate(project.collectionName);
  await expect(bundlesPage.runStatus(project.collectionName)).toContainText('Generated');
  await expect
    .poll(() => readOutput(join(output, 'en.json')))
    .toEqual({
      common: { greeting: 'Hello' },
      other: { farewell: 'Goodbye' },
    });
  await expect
    .poll(() => readOutput(join(output, 'fr-ca.json')))
    .toEqual({
      common: { greeting: 'Bonjour' },
      other: { farewell: 'Au revoir' },
    });
});

test('creates a key-pattern bundle in the dialog and generates only matching resources', async ({
  project,
  server,
  collectionsPage,
  bundlesPage,
  bundleFormDialog,
}) => {
  await project.addCollection();
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    translations: [{ locale: 'fr-ca', value: 'Bonjour' }],
  });
  await project.addResource({
    key: 'common.farewell',
    baseValue: 'Goodbye',
    translations: [{ locale: 'fr-ca', value: 'Au revoir' }],
  });
  await project.addResource({
    key: 'other.draft',
    baseValue: 'Draft',
    translations: [{ locale: 'fr-ca', value: 'Brouillon' }],
  });
  const output = join(project.artifactsFolder, 'pattern-bundle');
  await collectionsPage.goto();
  await bundlesPage.openCreate();
  await bundleFormDialog.fillOutput(project.collectionName, output);
  await bundleFormDialog.setSelectionRule('common.*');
  await expect(bundleFormDialog.matchingRules).toBeChecked();
  await expect(bundleFormDialog.dryRun).toContainText(/≈ 2(?!\d)/);
  await expect(bundleFormDialog.exampleKey).toContainText('common.greeting');
  await bundleFormDialog.submit();
  await expect(bundleFormDialog.dialog).toBeHidden();
  await expect
    .poll(async () => (await readConfig(server.projectRoot)).bundles?.[project.collectionName])
    .toEqual({
      dist: output,
      bundleName: '{locale}',
      collections: [{ name: project.collectionName, entriesSelectionRules: [{ matchingPattern: 'common.*' }] }],
    });
  await bundlesPage.generate(project.collectionName);
  await expect(bundlesPage.runStatus(project.collectionName)).toContainText('Generated');
  await expect
    .poll(() => readOutput(join(output, 'en.json')))
    .toEqual({
      common: { greeting: 'Hello', farewell: 'Goodbye' },
    });
  await expect
    .poll(() => readOutput(join(output, 'fr-ca.json')))
    .toEqual({
      common: { greeting: 'Bonjour', farewell: 'Au revoir' },
    });
});

test('matches bundle tag rules against tags inherited from the collection', async ({
  project,
  collectionsPage,
  bundlesPage,
}) => {
  await project.addCollection({ tags: ['shared'] });
  await project.addResource({
    key: 'common.greeting',
    baseValue: 'Hello',
    tags: ['release'],
    translations: [{ locale: 'fr-ca', value: 'Bonjour' }],
  });
  await project.addResource({
    key: 'common.draft',
    baseValue: 'Draft',
    translations: [{ locale: 'fr-ca', value: 'Brouillon' }],
  });
  const output = join(project.artifactsFolder, 'inherited-bundle');
  // Only the inherited collection tag lets common.greeting satisfy both tags; common.draft has shared alone.
  await project.addBundle({
    name: project.collectionName,
    bundle: {
      dist: output,
      bundleName: '{locale}',
      collections: [
        {
          name: project.collectionName,
          entriesSelectionRules: [
            { matchingPattern: '*', matchingTags: ['shared', 'release'], matchingTagOperator: 'All' },
          ],
        },
      ],
    },
  });
  await collectionsPage.goto();
  await bundlesPage.generate(project.collectionName);
  await expect(bundlesPage.runStatus(project.collectionName)).toContainText('Generated');
  await expect.poll(() => readOutput(join(output, 'en.json'))).toEqual({ common: { greeting: 'Hello' } });
  await expect.poll(() => readOutput(join(output, 'fr-ca.json'))).toEqual({ common: { greeting: 'Bonjour' } });
});
