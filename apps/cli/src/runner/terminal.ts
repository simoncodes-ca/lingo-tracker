/**
 * The one place the CLI asks the terminal what it is attached to. The Command Runner
 * reads it once per command; unit suites mock this module rather than the streams.
 */

/**
 * The CLI's single interactive rule: both stdin and stdout are a terminal. A pipe or a
 * redirect on either side (CI, `| tee log.txt`, `> out.json`) means non-interactive:
 * nothing is prompted, and required flags must be given.
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * True when stdin is not a terminal, so it can be read without waiting for a keyboard.
 * A different question from {@link isInteractiveTerminal}: `glossary > out.json` is
 * non-interactive, yet reading stdin there would wait for the keyboard.
 */
export function hasPipedStdin(): boolean {
  return !process.stdin.isTTY;
}
