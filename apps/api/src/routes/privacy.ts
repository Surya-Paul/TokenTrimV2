import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ApiPrivacyScanRequestSchema, ApiPrivacyScanResponse } from '@tokentrim/shared';

const privacyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/scan', async (request, reply) => {
    // Validate request body
    const body = ApiPrivacyScanRequestSchema.parse(request.body);

    // Scan for secrets
    // We instantiate a new detector here or access the engine's internal one if exposed.
    // Since privacyDetector is private in TokenTrimEngine, we can either expose a scanPrivacy method
    // on the engine, or just duplicate the simple scan here. For now, we will add a method to engine
    // or just import SecretDetector. Let's import and use a fresh instance.
    const { SecretDetector } = await import('@tokentrim/privacy');
    const detector = new SecretDetector({
      neverSendSecrets: true,
      maskSecretsInLogs: true
    });

    const result = detector.scan(body.text);

    const response: ApiPrivacyScanResponse = {
      hasSecrets: result.hasSecrets,
      riskLevel: result.riskLevel,
      secretTypes: Array.from(new Set(result.secrets.map(s => s.type))),
      secretCount: result.secrets.length
    };

    return reply.status(200).send(response);
  });
};

export default privacyRoutes;
