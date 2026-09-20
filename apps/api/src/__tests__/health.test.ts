import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import type { TokenTrimEngine } from '@tokentrim/core';

describe('Health API', () => {
  let server: FastifyInstance;
  let healthCheckSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    healthCheckSpy = vi.fn(async () => ({
      groq: { healthy: true, latencyMs: 50, lastChecked: Date.now() }
    }));

    const mockEngine = {
      healthCheck: healthCheckSpy
    } as unknown as TokenTrimEngine;

    server = await buildServer(mockEngine);
  });

  it('should return health status using injected engine (no real network call)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body.providers.groq.healthy).toBe(true);
    // Verify the injected mock was called, not a real provider
    expect(healthCheckSpy).toHaveBeenCalledTimes(1);
  });
});
