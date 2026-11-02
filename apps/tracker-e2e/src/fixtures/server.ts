import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { PlaywrightWorkerArgs, PlaywrightWorkerOptions, WorkerFixture } from '@playwright/test';

export interface Server {
  baseURL: string;
  projectRoot: string;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close((error) => {
        if (error) reject(error);
        else if (address && typeof address !== 'string') resolvePort(address.port);
        else reject(new Error('Could not allocate a Tracker e2e port'));
      });
    });
  });
}

export const serverFixture: WorkerFixture<Server, PlaywrightWorkerArgs & PlaywrightWorkerOptions> = async (
  { browserName: _browserName },
  use,
) => {
  const workspaceRoot = resolve(__dirname, '../../../..');
  const binary = join(workspaceRoot, 'dist/apps/api/main.js');
  const index = join(workspaceRoot, 'dist/apps/tracker/browser/index.html');
  for (const [path, project] of [
    [binary, 'api'],
    [index, 'tracker'],
  ]) {
    if (!existsSync(path))
      throw new Error(`Built ${project} not found at ${path}. Run pnpm nx build ${project} first.`);
  }

  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), 'lingo-tracker-e2e-')));
  try {
    await writeFile(
      join(projectRoot, '.lingo-tracker.json'),
      JSON.stringify({
        baseLocale: 'en',
        locales: ['en', 'fr-ca'],
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        collections: {},
      }),
    );
    const port = await freePort();
    const baseURL = `http://localhost:${port}`;
    const child = spawn(process.execPath, [binary, '--port', String(port), '--host', '127.0.0.1'], {
      cwd: projectRoot,
      env: { ...process.env, INIT_CWD: projectRoot, LINGO_TRACKER_REVALIDATE_INTERVAL_MS: '50' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let spawnError: Error | undefined;
    let exited = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const exit = new Promise<void>((resolveExit) => {
      child.once('error', (error) => {
        spawnError = error;
        exited = true;
        resolveExit();
      });
      child.once('exit', () => {
        exited = true;
        resolveExit();
      });
    });
    const diagnostics = () => `stdout:\n${stdout}\nstderr:\n${stderr}`;
    try {
      const deadline = Date.now() + 30_000;
      while (true) {
        if (exited) {
          throw new Error(
            `Tracker API exited before readiness (${spawnError?.message ?? child.exitCode ?? child.signalCode}).\n${diagnostics()}`,
          );
        }
        if (Date.now() >= deadline) throw new Error(`Tracker API readiness timed out after 30s.\n${diagnostics()}`);
        try {
          const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) });
          await response.text();
          if (response.ok) break;
        } catch {
          // The child may still be bootstrapping; its exit and deadline are checked above.
        }
        await delay(100);
      }
      await use({ baseURL, projectRoot });
    } finally {
      if (!exited) child.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL');
      }, 3_000);
      try {
        await exit;
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
};
