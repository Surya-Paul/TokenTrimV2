import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ApiHealthResponse } from '@tokentrim/shared';
const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Use a different rate limit for health checks
  fastify.get('/', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const providerHealth = await fastify.engine.healthCheck();
    const groqHealth = providerHealth['groq'];
    
    let status: ApiHealthResponse['status'] = 'ok';
    
    if (!groqHealth) {
      status = 'error';
    } else if (!groqHealth.healthy) {
      status = 'error';
    }

    const response: ApiHealthResponse = {
      status,
      version: '1.0.0',
      providers: {
        groq: groqHealth || {
          healthy: false,
          error: 'Provider not configured',
          lastChecked: Date.now()
        }
      }
    };

    return reply.status(status === 'error' ? 503 : 200).send(response);
  });
};

export default healthRoutes;
