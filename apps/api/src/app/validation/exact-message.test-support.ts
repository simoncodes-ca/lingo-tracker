/** Matches the entire error message, including literal path punctuation. */
export function exactMessage(message: string): RegExp {
  return new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}
