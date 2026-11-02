/** Minimal raw adapter; resolution may throw (including a browser storage getter). */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A key's wire format is fixed for both reads and writes. */
export interface StorageCodec<T> {
  parse(raw: string): T | undefined;
  serialize(value: T): string;
}

export function json<T>(parse: (raw: string) => T | undefined = JSON.parse): StorageCodec<T> {
  return { parse, serialize: JSON.stringify };
}

export function raw<T extends string = string>(
  parse: (value: string) => T | undefined = (value) => value as T,
): StorageCodec<T> {
  return { parse, serialize: (value) => value };
}

/** Best effort, silent persistence. Read/parse failures are absent; writes never throw. */
export class KeyedStorage<T> {
  constructor(
    private readonly adapter: () => StorageAdapter | undefined,
    private readonly key: string,
    private readonly codec: StorageCodec<T>,
  ) {}

  read(): T | undefined {
    try {
      const raw = this.adapter()?.getItem(this.key);
      return raw == null ? undefined : this.codec.parse(raw);
    } catch {
      return undefined;
    }
  }

  write(value: T): void {
    try {
      this.adapter()?.setItem(this.key, this.codec.serialize(value));
    } catch {
      // Persistence must not interrupt the caller.
    }
  }

  remove(): void {
    try {
      this.adapter()?.removeItem(this.key);
    } catch {
      // Persistence must not interrupt the caller.
    }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}
