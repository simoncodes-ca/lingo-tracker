import { beforeAll, afterAll, vi } from 'vitest';

/**
 * Global test setup to suppress console output during test runs.
 *
 * This prevents CLI command output (success messages, errors, etc.) from
 * cluttering test results while still allowing tests to verify that the
 * correct console methods were called with the expected messages.
 *
 * Individual tests can still spy on console methods and check their calls,
 * but the actual output to stdout/stderr is suppressed.
 *
 * Implementation notes:
 * - Uses vi.spyOn to create mocks that work seamlessly with test-level spies
 * - Tests using vi.spyOn(console, 'log') will create nested spies that still suppress output
 * - Tests using vi.restoreAllMocks() will clean up their spies while preserving global mocks
 * - The global mocks are only restored in afterAll when all tests complete
 * - Also mocks process.stdout.write and process.stderr.write to catch direct stream writes
 *   from libraries like prompts and commander that bypass console methods
 */

const consoleMocks = {
  log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
  error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
  info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
  debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

beforeAll(() => {
  // Suppress direct writes to process.stdout and process.stderr
  // These are used by prompts, commander, and other CLI libraries that bypass console methods
  // Return true to indicate successful write (expected by many libraries)
  process.stdout.write = vi.fn().mockReturnValue(true) as unknown as typeof process.stdout.write;
  process.stderr.write = vi.fn().mockReturnValue(true) as unknown as typeof process.stderr.write;
});

afterAll(() => {
  // Restore original console methods
  consoleMocks.log.mockRestore();
  consoleMocks.error.mockRestore();
  consoleMocks.warn.mockRestore();
  consoleMocks.info.mockRestore();
  consoleMocks.debug.mockRestore();

  // Restore original stream write methods
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
});
