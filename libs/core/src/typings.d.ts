declare module 'xliff' {
    export interface XliffOptions {
        sourceLanguage?: string;
        targetLanguage?: string;
        indent?: string;
    }

    export interface XliffJsObject {
        resources: Record<string, Record<string, { source: string; target: string; note?: string }>>;
        sourceLanguage?: string;
        targetLanguage?: string;
    }

    export function jsToXliff12(
        obj: XliffJsObject,
        options?: XliffOptions,
        cb?: (err: Error | null, res: string) => void
    ): Promise<string>;

    export function xliff12ToJs(
        xliff: string,
        cb?: (err: Error | null, res: XliffJsObject) => void
    ): Promise<XliffJsObject>;

    export function createxliff12(
        sourceLanguage: string,
        targetLanguage: string,
        source: Record<string, string>,
        target: Record<string, string>,
        namespace: string,
        cb?: (err: Error | null, res: string) => void,
        notes?: Record<string, string>
    ): Promise<string>;
}
