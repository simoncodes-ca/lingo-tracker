import { joinFolderPath } from '@simoncodes-ca/domain';
/** Checks a value's shape. An empty path denotes the root. */
export type Schema<T> = (value: unknown, path: string) => T;

export class SchemaError extends Error {
  constructor(
    readonly path: string,
    readonly requirement: string,
  ) {
    super(`${path || '<root>'} must ${requirement}`);
  }
}

export function fail(path: string, requirement: string): never {
  throw new SchemaError(path, requirement);
}

export function childPath(path: string, key: string): string {
  return joinFolderPath(path, key);
}

export function indexPath(path: string, index: number): string {
  return `${path}[${index}]`;
}

function notNull(value: unknown, path: string): void {
  if (value === null) fail(path, 'not be null');
}

export function string(minLength = 0): Schema<string> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'string') fail(path, 'be a string');
    if (value.length < minLength) fail(path, `have at least ${minLength} character(s)`);
    return value;
  };
}

export function nonEmptyString(): Schema<string> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'string' || value.trim() === '') fail(path, 'be a non-empty string');
    return value;
  };
}

export function boolean(): Schema<boolean> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'boolean') fail(path, 'be a boolean');
    return value;
  };
}

export function integer(): Schema<number> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'be an integer');
    return value;
  };
}

export function integerString(): Schema<string> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) fail(path, 'be a positive integer');
    return value;
  };
}

export function unknown(): Schema<unknown> {
  return (value) => value;
}

export function anyObject(): Schema<Record<string, unknown>> {
  return (value, path) => {
    notNull(value, path);
    if (typeof value !== 'object' || Array.isArray(value)) fail(path, 'be an object');
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(path, 'be an object');
    return value as Record<string, unknown>;
  };
}

export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return (value, path) => {
    if (value === undefined) return undefined;
    return schema(value, path);
  };
}

export function array<T>(item: Schema<T>): Schema<T[]> {
  return (value, path) => {
    notNull(value, path);
    if (!Array.isArray(value)) fail(path, 'be an array');
    for (let index = 0; index < value.length; index++) item(value[index], indexPath(path, index));
    return value;
  };
}

export function nonEmptyArray<T>(item: Schema<T>): Schema<T[]> {
  const items = array(item);
  return (value, path) => {
    notNull(value, path);
    if (!Array.isArray(value) || value.length === 0) fail(path, 'be a non-empty array');
    return items(value, path);
  };
}

export function record<T>(schema: Schema<T>): Schema<Record<string, T>> {
  return (value, path) => {
    const entries = anyObject()(value, path);
    for (const [key, entry] of Object.entries(entries)) schema(entry, childPath(path, key));
    return entries as Record<string, T>;
  };
}

export function object<T extends object>(fields: { [K in keyof T]-?: Schema<T[K]> }): Schema<T> {
  return (value, path) => {
    const entries = anyObject()(value, path);
    for (const key of Object.keys(fields) as Array<keyof T>) {
      fields[key](entries[String(key)], childPath(path, String(key)));
    }
    return entries as T;
  };
}

export function oneOrMany<T>(item: Schema<T>): Schema<T | T[]> {
  return (value, path) => {
    notNull(value, path);
    if (Array.isArray(value)) return nonEmptyArray(item)(value, path);
    if (typeof value !== 'object') fail(path, 'be an object or a non-empty array');
    return item(value, path);
  };
}
