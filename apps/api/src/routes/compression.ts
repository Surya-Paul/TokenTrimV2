import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ApiCompressionRequestSchema, ApiCompressionResponse, COMPRESSION_TARGETS } from '@tokentrim/shared';
const compressionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/', async (request, reply) => {
    try {
      // Validate request body
      const body = ApiCompressionRequestSchema.parse(request.body);
      const target = COMPRESSION_TARGETS[body.compressionTarget];
      const safeResultMode = body.safeResultMode;
      const usesRelaxedSemanticThreshold = body.compressionTarget === 'aggressive' || body.compressionTarget === 'extreme';

      // Run compression
      const result = await fastify.engine.compress(body.text, {
        targetModel: body.targetModel,
        compressionTarget: body.compressionTarget,
        targetReductionRatio: target.targetReductionRatio,
        minimumReductionRatio: target.minimumReductionRatio,
        maximumReductionRatio: target.maximumReductionRatio,
        maxCompressionRatio: target.maximumReductionRatio,
        preserveFormatting: true,
        safeResultMode,
        verificationThresholds: {
          semanticConfidence: usesRelaxedSemanticThreshold ? 0.7 : 0.85,
          instructionConfidence: usesRelaxedSemanticThreshold ? 0.8 : 0.9,
          technicalIntegrity: 0.95,
          privacyConfidence: 1.0,
          compressionConfidence: 0.7,
          overall: usesRelaxedSemanticThreshold ? 0.75 : 0.85
        }
      });

      const targetReductionPercent = target.targetReductionRatio * 100;

      if (!result.accepted || !result.bestCandidate) {
        // Safe rejection - no error thrown, just returning a valid response with accepted=false
        const response: ApiCompressionResponse = {
          success: true,
          data: {
            compressedText: result.originalText,
            originalTokens: result.originalTokens,
            compressedTokens: result.finalTokens,
            grossReduction: 0,
            compressionOverhead: 0,
            netSavings: 0,
            provider: 'deterministic',
            tier: 'tier0',
            safetyScores: {
              semanticConfidence: 0,
              instructionConfidence: 0,
              technicalIntegrity: 0,
              privacyConfidence: 0,
              compressionConfidence: 0,
              overall: 0
            },
            processingTimeMs: result.processingTimeMs,
            accepted: false,
            rejectionReason: result.rejectionReason,
            compressionTarget: body.compressionTarget,
            targetReductionPercent,
            actualReductionPercent: 0,
            targetAchieved: false,
            safeResultMode
          }
        };
        return reply.status(200).send(response);
      }

      // Re-count tokens on the actual compressed text for accurate measurement
      const compressedTokens = await fastify.engine.countTokens(
        result.bestCandidate.compressedText,
        body.targetModel
      );
      const grossReduction = result.originalTokens - compressedTokens;
      const actualReductionPercent = result.originalTokens > 0
        ? Number(((grossReduction / result.originalTokens) * 100).toFixed(1))
        : 0;
      const targetAchieved = result.accepted
        && actualReductionPercent >= target.minimumReductionRatio * 100
        && actualReductionPercent <= target.maximumReductionRatio * 100;

      const response: ApiCompressionResponse = {
        success: true,
        data: {
          compressedText: result.bestCandidate.compressedText,
          originalTokens: result.originalTokens,
          compressedTokens,
          grossReduction,
          compressionOverhead: result.bestCandidate.compressionOverhead,
          netSavings: grossReduction - result.bestCandidate.compressionOverhead,
          provider: result.bestCandidate.provider,
          tier: result.bestCandidate.tier,
          safetyScores: result.bestCandidate.safetyScores,
          processingTimeMs: result.processingTimeMs,
          accepted: true,
          compressionTarget: body.compressionTarget,
          targetReductionPercent,
          actualReductionPercent,
          targetAchieved,
          safeResultMode,
          forcedTargetResult: result.forcedTargetResult,
          fallbackReason: result.fallbackReason
        }
      };

      return reply.status(200).send(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw error; // Let global error handler catch Zod errors
      }
      
      // Let global error handler catch TokenTrimError (e.g. SECRETS_DETECTED)
      throw error;
    }
  });
};

export default compressionRoutes;
