import { LingoTrackerError } from './error-definition';

type ErrorConstructor = abstract new (...args: never[]) => LingoTrackerError;
type RegisteredError = ErrorConstructor & { readonly code: string };

type Catalogue<Definitions, ExemptName> = {
  readonly [Name in keyof Definitions as Name extends ExemptName
    ? never
    : Definitions[Name] extends RegisteredError
      ? Name
      : never]: Definitions[Name];
};

type LiteralCodes<Definitions, ExemptName> = {
  readonly [Name in keyof Definitions]: Name extends ExemptName
    ? Definitions[Name]
    : Definitions[Name] extends ErrorConstructor
      ? Definitions[Name] extends RegisteredError
        ? string extends Definitions[Name]['code']
          ? never
          : Definitions[Name]
        : never
      : Definitions[Name];
};

/** Runtime registration and its type filter both require a typed-error constructor and a string code. */
export function createErrorCatalogue<
  const Definitions extends Record<string, unknown>,
  const ExemptNames extends readonly (keyof Definitions & string)[] = readonly [],
>(
  definitions: Definitions & LiteralCodes<NoInfer<Definitions>, NoInfer<ExemptNames[number]>>,
  exemptions?: ExemptNames,
): Catalogue<Definitions, ExemptNames[number]> {
  const exemptNames = new Set<string>(exemptions ?? []);
  const entries: [string, unknown][] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries<unknown>(definitions)) {
    if (exemptNames.has(name)) continue;
    if (typeof value !== 'function' || (value !== LingoTrackerError && !(value.prototype instanceof LingoTrackerError)))
      continue;
    if (!('code' in value) || typeof value.code !== 'string') {
      throw new Error(`Error subclass ${name} must declare a static string code`);
    }
    if (seen.has(value.code)) {
      throw new Error(`Duplicate error code "${value.code}" registered by ${name}`);
    }
    seen.add(value.code);
    entries.push([name, value]);
  }
  return Object.fromEntries(entries) as Catalogue<Definitions, ExemptNames[number]>;
}
