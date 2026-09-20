import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';

describe('Privacy API', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const mockEngine = {} as unknown as import('@tokentrim/core').TokenTrimEngine;
    server = await buildServer(mockEngine);
  });

  it('should scan clean text', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/privacy/scan',
      payload: {
        text: 'This is a safe prompt without any secrets.'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.hasSecrets).toBe(false);
    expect(body.riskLevel).toBe('none');
  });

  it('should detect secrets in text', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/privacy/scan',
      payload: {
        text: 'My AWS key is AKIA1234567890123456'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.hasSecrets).toBe(true);
    expect(body.secretTypes).toContain('aws_credentials');
  });
});
