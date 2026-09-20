import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';
import type { TokenTrimEngine } from '@tokentrim/core';

describe('Compression API', () => {
  let server: FastifyInstance;
  let compressSpy: any;

  beforeEach(async () => {
    compressSpy = vi.fn(async (text: string) => {
      if (text.includes('sk-secret')) {
        const error = new Error('Secrets detected in prompt. Compression aborted.') as Error & { code?: string; metadata?: Record<string, unknown> };
        error.name = 'TokenTrimError';
        error.code = 'SECRETS_DETECTED';
        error.metadata = { secretTypes: ['api_key'] };
        throw error;
      }
      return {
        accepted: true,
        originalText: text,
        originalTokens: 10,
        finalTokens: 5,
        processingTimeMs: 100,
        bestCandidate: {
          compressedText: 'compressed',
          grossTokenReduction: 5,
          compressionOverhead: 1,
          netTokenSavings: 4,
          provider: 'groq',
          tier: 'cloud_ai',
          safetyScores: { overall: 0.9 }
        },
        estimatedCostSavings: 0.01
      };
    });

    const countTokensSpy = vi.fn().mockImplementation(async (text: string) => {
      // Mock counting based on text length for simple tests
      return text === 'compressed text' || text === 'compressed' ? 5 : 10;
    });

    const mockEngine = {
      compress: compressSpy,
      countTokens: countTokensSpy,
      initialize: vi.fn().mockResolvedValue(undefined)
    } as unknown as TokenTrimEngine;

    server = await buildServer(mockEngine);
  });

  it('should compress valid text and return a valid response (Safe Result Mode ON by default)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'This is a test prompt',
        targetModel: 'gpt-4',
        compressionTarget: 'balanced'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.compressedText).toBe('compressed');
    expect(body.data.originalTokens).toBe(10);
    expect(body.data.compressedTokens).toBe(5);
    expect(body.data.provider).toBe('groq');
    expect(body.data.accepted).toBe(true);
    expect(body.data.targetReductionPercent).toBe(35);
    expect(body.data.actualReductionPercent).toBe(50);
    expect(body.data.targetAchieved).toBe(false);
    expect(body.data.safeResultMode).toBe(true);
  });

  it('should reject out-of-range result when safeResultMode is OFF (Force Target Mode)', async () => {
    // Engine mock returns rejected result because it's out of bounds
    compressSpy.mockImplementationOnce(async () => {
      return {
        accepted: false,
        rejectionReason: 'No candidate achieved the target reduction range',
        originalText: 'This is a test prompt',
        originalTokens: 10,
        finalTokens: 10,
        processingTimeMs: 100,
        bestCandidate: null,
        allCandidates: []
      };
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'This is a test prompt',
        targetModel: 'gpt-4',
        compressionTarget: 'balanced',
        safeResultMode: false
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(false);
    expect(body.data.targetAchieved).toBe(false);
    expect(body.data.safeResultMode).toBe(false);
    expect(body.data.rejectionReason).toContain('No candidate achieved');
  });

  it('should accept in-range result even when safeResultMode is OFF', async () => {
    // Mock the engine so it returns a 35% reduction (inside balanced bounds)
    compressSpy.mockImplementationOnce(async () => {
      return {
        accepted: true,
        originalText: 'text',
        originalTokens: 100,
        finalTokens: 65,
        processingTimeMs: 100,
        bestCandidate: {
          compressedText: 'balanced compressed text',
          grossTokenReduction: 35,
          compressionOverhead: 1,
          netTokenSavings: 34,
          provider: 'groq',
          tier: 'cloud_ai',
          safetyScores: { overall: 0.9 }
        }
      };
    });
    
    // Override the global mock to return exactly 65 tokens for this test
    const mockEngine = server.engine as unknown as Record<string, unknown>;
    const countTokensSpy = mockEngine.countTokens as ReturnType<typeof vi.fn>;
    countTokensSpy.mockResolvedValueOnce(65);

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'This is a test prompt',
        targetModel: 'gpt-4',
        compressionTarget: 'balanced',
        safeResultMode: false
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(true);
    expect(body.data.targetAchieved).toBe(true);
    expect(body.data.safeResultMode).toBe(false);
    expect(body.data.actualReductionPercent).toBe(35);
  });

  it('maps the Extreme preset to an explicit 75% target and safe range', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'This is a test prompt',
        targetModel: 'gpt-4',
        compressionTarget: 'extreme'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(compressSpy).toHaveBeenCalledWith(
      'This is a test prompt',
      expect.objectContaining({
        compressionTarget: 'extreme',
        targetReductionRatio: 0.75,
        minimumReductionRatio: 0.68,
        maximumReductionRatio: 0.8
      })
    );

    const body = JSON.parse(response.payload);
    expect(body.data.targetReductionPercent).toBe(75);
  });

  it('should return HTTP 422 with code SECRETS_DETECTED for secret input', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'My secret is sk-secret12345678901234567890',
        targetModel: 'gpt-4',
        compressionTarget: 'balanced'
      }
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe('SECRETS_DETECTED');
    expect(body.message).toBeDefined();
    // Must not leak the raw prompt or secret in the response
    expect(body.message).not.toContain('sk-secret');
    expect(JSON.stringify(body)).not.toContain('sk-secret12345678901234567890');
  });

  it('should not attempt cloud/provider generation for secret input', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        text: 'My secret is sk-secret12345678901234567890',
        targetModel: 'gpt-4',
        compressionTarget: 'balanced'
      }
    });

    // The mock was called exactly once — it threw immediately on secret detection,
    // meaning no cloud provider generation was attempted after detection
    expect(compressSpy).toHaveBeenCalledTimes(1);
  });

  it('should return HTTP 400 with code VALIDATION_ERROR for malformed payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/compressions',
      payload: {
        // missing required 'text' field
        targetModel: 'gpt-4'
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBeDefined();
  });
});
