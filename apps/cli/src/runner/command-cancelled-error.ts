/**
 * Thrown to end a command as cancelled: the runner prints `❌ <name> cancelled.` and
 * exits 0. The runner throws it when a prompt is cancelled; a command throws it when the
 * user declines a confirmation.
 */
export class CommandCancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CommandCancelledError';
  }
}
