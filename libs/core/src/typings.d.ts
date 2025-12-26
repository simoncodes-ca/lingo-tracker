declare module 'xliff' {
    export interface XliffOptions {
        sourceLanguage?: string;
        targetLanguage?: string;
        indent?: string;
    }

    export function jsToXliff12(
        obj: any,
        options?: XliffOptions,
        cb?: (err: Error | null, res: string) => void
    ): Promise<string>;

    export function xliff12ToJs(
        xliff: string,
        cb?: (err: Error | null, res: any) => void
    ): Promise<any>;

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
