import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { TokenTrimEngine } from '@tokentrim/core';
import { getBodySizeBytes, getConfig } from './config';

declare module 'fastify' {
  interface FastifyInstance {
    engine: TokenTrimEngine;
  }
}

// Routes
import compressionRoutes from './routes/compression';
import privacyRoutes from './routes/privacy';
import healthRoutes from './routes/health';

let defaultEngine: TokenTrimEngine | null = null;

function createDefaultEngine(): TokenTrimEngine {
  const config = getConfig();
  return new TokenTrimEngine({
    targetModel: config.TARGET_MODEL,
    groqConfig: config.GROQ_API_KEY ? {
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_MODEL,
      timeoutMs: 60000,
      maxRetries: 1,
      retryDelayMs: 1000
    } : undefined,
    privacySettings: {
      neverSendSecrets: true,
      maskSecretsInLogs: true
    },
    enableTelemetry: true
  });
}

export function getDefaultEngine(): TokenTrimEngine {
  if (!defaultEngine) {
    defaultEngine = createDefaultEngine();
  }
  return defaultEngine;
}

export async function buildServer(injectedEngine?: TokenTrimEngine) {
  const config = getConfig();
  const engine = injectedEngine || getDefaultEngine();
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.body.text'] // Never log prompt text
    },
    bodyLimit: getBodySizeBytes(),
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

  // Initialize engine (validates Groq model at startup)
  await (injectedEngine || engine).initialize();

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
  fastify.setErrorHandler(function (error: unknown, request, reply) {
    // Fastify HTTP errors (rate limits, bad requests, sensible)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const codeMap: Record<number, string> = {
        429: 'RATE_LIMITED',
        408: 'TIMEOUT',
        503: 'PROVIDER_UNAVAILABLE',
        504: 'GATEWAY_TIMEOUT'
      };
      const err = error as { statusCode: number; name?: string; message?: string };
      
      reply.status(err.statusCode).send({
        code: codeMap[err.statusCode] || err.name || 'HTTP_ERROR',
        message: err.message
      });
      return;
    }

    // Zod validation errors
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ZodError') {
      reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: error
      });
      return;
    }
    
    // Custom TokenTrim errors
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'TokenTrimError') {
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
  const config = getConfig();
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
