import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { TokenTrimEngine } from '@tokentrim/core';
import { config, bodySizeBytes } from './config';

declare module 'fastify' {
  interface FastifyInstance {
    engine: TokenTrimEngine;
  }
}

// Routes
import compressionRoutes from './routes/compression';
import privacyRoutes from './routes/privacy';
import healthRoutes from './routes/health';

// Initialize core engine
export const engine = new TokenTrimEngine({
  targetModel: config.TARGET_MODEL,
  groqConfig: {
    apiKey: config.GROQ_API_KEY,
    model: config.GROQ_MODEL,
    timeoutMs: config.REQUEST_TIMEOUT_MS,
    maxRetries: 3,
    retryDelayMs: 1000
  },
  privacySettings: {
    neverSendSecrets: true,
    maskSecretsInLogs: true
  },
  enableTelemetry: true
});

export async function buildServer(injectedEngine?: TokenTrimEngine) {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.body.text'] // Never log prompt text
    },
    bodyLimit: bodySizeBytes,
  });

  // Auth Hook
  if (config.API_AUTH_TOKEN) {
    fastify.log.info('API Authentication enabled.');
    fastify.addHook('onRequest', async (request, reply) => {
      // Allow preflight/health checks to bypass auth
      if (request.method === 'OPTIONS' || request.routeOptions.url === '/api/v1/health') {
        return;
      }
      
      const authHeader = request.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${config.API_AUTH_TOKEN}`) {
        reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Valid API_AUTH_TOKEN required'
        });
        return reply;
      }
    });
  } else {
    fastify.log.warn('Running without API_AUTH_TOKEN. Publicly accessible!');
  }

  // Inject Engine
  fastify.decorate('engine', injectedEngine || engine);

  // Plugins
  await fastify.register(sensible);
  
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS']
  });

  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute'
  });

  // Global Error Handler
  fastify.setErrorHandler(function (error, request, reply) {
    // Fastify HTTP errors (rate limits, bad requests, sensible)
    if (error.statusCode) {
      const codeMap: Record<number, string> = {
        429: 'RATE_LIMITED',
        408: 'TIMEOUT',
        503: 'PROVIDER_UNAVAILABLE',
        504: 'GATEWAY_TIMEOUT'
      };
      
      reply.status(error.statusCode).send({
        code: codeMap[error.statusCode] || error.name || 'HTTP_ERROR',
        message: error.message
      });
      return;
    }

    // Zod validation errors
    if (error.name === 'ZodError') {
      reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: error
      });
      return;
    }
    
    // Custom TokenTrim errors
    if (error.name === 'TokenTrimError') {
      const trimError = error as Error & { code?: string; metadata?: unknown };
      const code = trimError.code || 'INTERNAL_ERROR';
      const statusCode = code === 'SECRETS_DETECTED' ? 422 : 500;
      
      reply.status(statusCode).send({
        code: code,
        message: trimError.message,
        details: trimError.metadata
      });
      return;
    }

    // Unhandled server error
    this.log.error(error);
    reply.status(500).send({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    });
  });

  // Register Routes
  fastify.register(compressionRoutes, { prefix: '/api/v1/compressions' });
  fastify.register(privacyRoutes, { prefix: '/api/v1/privacy' });
  fastify.register(healthRoutes, { prefix: '/api/v1/health' });

  return fastify;
}

// Start server if this is the main module
if (require.main === module) {
  buildServer().then(server => {
    server.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      server.log.info(`TokenTrim API listening on ${address}`);
    });
  });
}
