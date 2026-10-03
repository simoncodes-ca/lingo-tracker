import { describe, expect, it, vi } from 'vitest';
import { resolveMutationSink } from '../resource/resource-mutation';
import { openCollection } from './open-collection';

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
    const collection = openCollection(config, 'main', { writable: true, onMutation });
    expect(collection.onMutation).toBe(onMutation);
    expect(resolveMutationSink(collection)).toBe(onMutation);
    expect(resolveMutationSink(collection, { onMutation: undefined })).toBe(onMutation);
  });

  it('prefers an explicit sink over the collection sink', () => {
    const inherited = vi.fn();
    const explicit = vi.fn();
    expect(
      resolveMutationSink({ translationsFolder: 'translations', onMutation: inherited }, { onMutation: explicit }),
    ).toBe(explicit);
  });

  it('supports explicit callbacks on collections without a sink', () => {
    const onMutation = vi.fn();
    expect(resolveMutationSink(openCollection(config, 'main'), { onMutation })).toBe(onMutation);
  });

  it('accepts a narrow collection shape without a sink property', () => {
    const collection = { translationsFolder: 'translations' };
    const onMutation = vi.fn();
    expect(resolveMutationSink(collection)).toBeUndefined();
    expect(resolveMutationSink(collection, { onMutation })).toBe(onMutation);
  });

  it('leaves writes without a consumer unobserved', () => {
    expect(resolveMutationSink(openCollection(config, 'main'))).toBeUndefined();
  });
});
