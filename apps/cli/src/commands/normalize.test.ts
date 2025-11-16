import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeCommand } from './normalize';

vi.mock('node:fs');
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  normalize: vi.fn(),
}));

describe('normalizeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(normalizeCommand).toBeDefined();
  });

  it('should be a function', () => {
    expect(typeof normalizeCommand).toBe('function');
  });

  // More comprehensive tests would be added here
  // For now, we're just verifying the basic structure
});
