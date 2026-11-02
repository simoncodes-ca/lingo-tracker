import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';

/** Raw stream writes, including their newlines. */
export interface CommandOutputSink {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

interface OutputScope {
  readonly sink: CommandOutputSink;
}

const outputScope = new AsyncLocalStorage<OutputScope>();

/** Isolates nested and concurrent runs without replacing console or process streams. */
export function withCommandOutput<T>(scope: OutputScope, run: () => T): T {
  return outputScope.run(scope, run);
}

export const CommandOutput = {
  log(...values: unknown[]): void {
    const sink = outputScope.getStore()?.sink;
    if (sink) sink.stdout(`${format(...values)}\n`);
    else console.log(...values);
  },
  error(...values: unknown[]): void {
    const sink = outputScope.getStore()?.sink;
    if (sink) sink.stderr(`${format(...values)}\n`);
    else console.error(...values);
  },
  warn(...values: unknown[]): void {
    const sink = outputScope.getStore()?.sink;
    if (sink) sink.stderr(`${format(...values)}\n`);
    else console.warn(...values);
  },
  write(text: string): void {
    const sink = outputScope.getStore()?.sink;
    if (sink) sink.stdout(text);
    else process.stdout.write(text);
  },
};
