import { vi, type Mock } from 'vitest';
import { commandManifest, type CommandManifest } from '../command-manifest';

export function createRecordingManifest(): {
  handlers: Map<string, Mock>;
  recordingManifest: CommandManifest;
  handler: (name: string) => Mock;
} {
  const handlers = new Map(commandManifest.map((entry) => [entry.name, vi.fn()]));
  const handler = (name: string) => {
    const recorded = handlers.get(name);
    if (!recorded) throw new Error(`Missing recorder for ${name}`);
    return recorded;
  };
  const recordingManifest = commandManifest.map((entry) => ({
    ...entry,
    load: async () => handler(entry.name),
  }));
  return { handlers, recordingManifest, handler };
}
