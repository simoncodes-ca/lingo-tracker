/**
 * Type definitions for xliff 6.2.2
 * https://github.com/locize/xliff
 */

declare module 'xliff' {
  export interface XliffOptions {
    targetLanguage?: string;
    sourceLanguage?: string;
    indent?: string;
  }

  export interface XliffResource {
    source: string;
    target: string;
    note?: string;
  }

  export interface XliffData {
    resources: {
      [namespace: string]: {
        [key: string]: XliffResource;
      };
    };
  }

  export function jsToXliff12(
    data: XliffData,
    options: XliffOptions,
    callback: (err: Error | null, result: string) => void,
  ): void;

  export function xliff12ToJs(xliff: string, callback: (err: Error | null, result: XliffData) => void): void;
}
