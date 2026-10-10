import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const workspaceRoot = resolve(__dirname, '../../../..');
const binaryPath = join(workspaceRoot, 'dist/apps/cli/main.cjs');

interface RunCliOptions {
  cwd: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], { cwd, input, env, timeoutMs = 20_000 }: RunCliOptions): Promise<CliResult> {
  if (!existsSync(binaryPath)) {
    throw new Error(`Built CLI not found at ${binaryPath}. Run nx build cli first.`);
  }

  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [binaryPath, ...args], {
      cwd,
      // pnpm's inherited INIT_CWD otherwise points back at the workspace.
      env: { ...process.env, CI: 'true', NO_COLOR: '1', ...env, INIT_CWD: cwd },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            `CLI ${JSON.stringify(args)} timed out after ${timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      } else if (signal) {
        reject(
          new Error(`CLI ${JSON.stringify(args)} terminated by ${signal}.\nstdout:\n${stdout}\nstderr:\n${stderr}`),
        );
      } else {
        resolveResult({ exitCode, stdout, stderr });
      }
    });
    // Early CLI exits may close stdin before our input has been consumed.
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        child.kill('SIGKILL');
        reject(error);
      }
    });
    child.stdin.end(input ?? '');
  });
}

export function createTempProject() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-cli-e2e-')));
  return { cwd, cleanup: (): void => rmSync(cwd, { recursive: true, force: true }) };
}
