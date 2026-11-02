import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { openResourceFolder } from '../resource/resource-folder';
import type { MutationSink } from '../resource/resource-mutation';
import { openCollection, openProjectCollection } from './open-collection';

const config = {
  exportFolder: 'export',
  importFolder: 'import',
  baseLocale: 'en',
  locales: ['en'],
  collections: { main: { translationsFolder: 'translations' } },
};

describe('collection mutation sink', () => {
  it('retains the sink on the opened collection and uses it by default', () => {
    const onMutation = vi.fn();
    expect(openCollection(config, 'main', { writable: true, onMutation }).onMutation).toBe(onMutation);
  });
  it('prefers an explicit sink when opening a project collection', () => {
    const inherited = vi.fn();
    const explicit = vi.fn();
    const project = openCollection(config, 'main', { onMutation: inherited });
    expect(openProjectCollection(project, 'main', { onMutation: explicit }).onMutation).toBe(explicit);
  });
  it('supports callbacks when opening a collection', () => {
    const onMutation = vi.fn();
    expect(openCollection(config, 'main', { onMutation }).onMutation).toBe(onMutation);
  });
  it('requires a sink and translations root at the reported write opener', () => {
    expectTypeOf<Parameters<typeof openResourceFolder>[1]>().toMatchTypeOf<{
      onMutation: MutationSink;
      translationsFolder: string;
    }>();
  });
  it('gives CLI collections a no-op sink when no consumer is supplied', () => {
    const collection = openCollection(config, 'main');
    expect(() =>
      collection.onMutation({ kind: 'reindex', translationsFolder: collection.translationsFolder }),
    ).not.toThrow();
  });
});
