import { describe, expect, it } from 'vitest';
import { json, KeyedStorage, MemoryStorageAdapter, raw, type StorageAdapter } from './keyed-storage';

describe('KeyedStorage', () => {
  it('isolates keys, round trips JSON and removes only its own value', () => {
    const adapter = new MemoryStorageAdapter();
    const first = new KeyedStorage<{ count: number }>(() => adapter, 'first', json());
    const second = new KeyedStorage<{ count: number }>(() => adapter, 'second', json());
    first.write({ count: 1 });
    second.write({ count: 2 });
    expect(first.read()).toEqual({ count: 1 });
    first.remove();
    expect(first.read()).toBeUndefined();
    expect(second.read()).toEqual({ count: 2 });
  });

  it('supports raw string formats and rejected or corrupt values', () => {
    const adapter = new MemoryStorageAdapter();
    const storage = new KeyedStorage<string>(() => adapter, 'theme', raw());
    storage.write('dark');
    expect(adapter.getItem('theme')).toBe('dark');
    const validated = new KeyedStorage(
      () => adapter,
      'theme',
      raw((value) => (value === 'light' ? value : undefined)),
    );
    expect(validated.read()).toBeUndefined();
    const jsonStorage = new KeyedStorage<string>(() => adapter, 'theme', json());
    expect(jsonStorage.read()).toBeUndefined();
    expect(storage.read()).toBe('dark');
  });

  it('keeps the JSON string codec paired across writes and reads', () => {
    const adapter = new MemoryStorageAdapter();
    const storage = new KeyedStorage<string>(() => adapter, 'string', json());
    storage.write('dark');
    expect(adapter.getItem('string')).toBe('"dark"');
    expect(storage.read()).toBe('dark');
  });

  it('silently tolerates missing adapters and blocked storage getters', () => {
    for (const resolve of [
      () => undefined,
      () => {
        throw new Error('blocked getter');
      },
    ]) {
      const storage = new KeyedStorage<string>(resolve, 'key', json());
      expect(storage.read()).toBeUndefined();
      expect(() => storage.write('value')).not.toThrow();
      expect(() => storage.remove()).not.toThrow();
    }
  });

  it('contains read, quota, remove, parser and serializer failures', () => {
    const fail = (): never => {
      throw new Error('storage unavailable');
    };
    const adapter: StorageAdapter = { getItem: fail, setItem: fail, removeItem: fail };
    const storage = new KeyedStorage<string>(() => adapter, 'key', json());
    expect(storage.read()).toBeUndefined();
    expect(() => storage.write('value')).not.toThrow();
    expect(() => storage.remove()).not.toThrow();
    const memory = new MemoryStorageAdapter();
    const brokenSerializer = new KeyedStorage<string>(() => memory, 'key', { parse: fail, serialize: fail });
    expect(() => brokenSerializer.write('value')).not.toThrow();
    expect(memory.getItem('key')).toBeNull();
    memory.setItem('key', 'value');
    expect(brokenSerializer.read()).toBeUndefined();
  });
});
