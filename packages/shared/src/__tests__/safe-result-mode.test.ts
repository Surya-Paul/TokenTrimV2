import { describe, it, expect } from 'vitest';
import { ApiCompressionRequestSchema } from '../index';

describe('Safe Result Mode - Schema Validation', () => {
  it('should default safeResultMode to true if not provided', () => {
    const payload = {
      text: 'Test prompt',
      targetModel: 'gpt-4',
      compressionTarget: 'balanced'
    };
    const parsed = ApiCompressionRequestSchema.parse(payload);
    expect(parsed.safeResultMode).toBe(true);
  });

  it('should accept safeResultMode as false', () => {
    const payload = {
      text: 'Test prompt',
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      safeResultMode: false
    };
    const parsed = ApiCompressionRequestSchema.parse(payload);
    expect(parsed.safeResultMode).toBe(false);
  });
});
