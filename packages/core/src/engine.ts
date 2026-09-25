import {
  CompressionResult,
  CompressionOptions,
  CompressionCandidate,
  CompressionTier,
  ProviderType,
  AnalysisResult,
  TargetModel,
  ProcessingMode,
  VerificationThresholds,
  SecretDetectionResult,
  PrivacySettings,
  TokenTrimError
} from '@tokentrim/shared';
import { InputAnalyzer } from '@tokentrim/analyzer';
import { Tier0Compressor } from '@tokentrim/compressor';
import { AICompressor, ForceTargetDiagnostics } from '@tokentrim/compressor';
import { VerificationEngine } from '@tokentrim/verifier';
import { SecretDetector } from '@tokentrim/privacy';
import { ProviderFactory, GroqProvider } from '@tokentrim/providers';
import { tokenizerRegistry, createTokenizerConfig } from '@tokentrim/tokenizer';
import { Telemetry } from '@tokentrim/telemetry';

export interface TokenTrimEngineConfig {
  targetModel: TargetModel;
  groqConfig?: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  privacySettings?: PrivacySettings;
  verificationThresholds?: Partial<VerificationThresholds>;
  enableTelemetry?: boolean;
}

const OVERALL_DEADLINE_MS = 25000;
const FORCE_TARGET_DEADLINE_MS = 120000;

interface PipelineContext {
  originalText: string;
  options: CompressionOptions;
  analysis: AnalysisResult;
  privacyScan: SecretDetectionResult;
  originalTokens: number;
  tier0Candidate: CompressionCandidate | null;
  aiCandidates: CompressionCandidate[];
  bestCandidate: CompressionCandidate | null;
  fallbackCandidate: CompressionCandidate | null;
  bestCandidatePassed: boolean;
  forcedTargetResult?: boolean;
  verificationResult: import('@tokentrim/verifier').VerificationResult | null;
  mode: ProcessingMode;
  startTime: number;
  cloudError?: Error;
}

export class TokenTrimEngine {
  private analyzer: InputAnalyzer;
  private tier0Compressor: Tier0Compressor;
  private aiCompressor: AICompressor;
  private verifier: VerificationEngine;
  private privacyDetector: SecretDetector;
  private providerFactory: ProviderFactory;
  private groqProvider: GroqProvider | null = null;
  private telemetry: Telemetry;
  private config: TokenTrimEngineConfig;

  constructor(config: TokenTrimEngineConfig) {
    this.config = config;
    this.analyzer = new InputAnalyzer(config.targetModel);
    this.tier0Compressor = new Tier0Compressor(config.targetModel);
    this.aiCompressor = new AICompressor(config.targetModel);
    this.verifier = new VerificationEngine(config.verificationThresholds || {}, config.targetModel);
    this.privacyDetector = new SecretDetector(config.privacySettings || {
      neverSendSecrets: true,
      maskSecretsInLogs: true
    });
    this.providerFactory = new ProviderFactory();
    this.telemetry = new Telemetry(config.enableTelemetry !== false);

    this.initializeProviders();
  }

  private initializeProviders(): void {
    const providers = this.providerFactory.createProviders({
      groq: this.config.groqConfig
    });
    this.groqProvider = providers.groq || null;
  }

  /**
   * Check whether a candidate's reduction ratio falls within the requested target range.
   */
  private isInTargetRange(candidate: CompressionCandidate, originalTokens: number, options: CompressionOptions): boolean {
    if (originalTokens <= 0) return false;
    const ratio = candidate.grossTokenReduction / originalTokens;
    const min = options.minimumReductionRatio ?? 0;
    const max = options.maximumReductionRatio ?? 1;
    return ratio >= min && ratio <= max;
  }

async compress(text: string, options: CompressionOptions): Promise<CompressionResult> {
    const startTime = Date.now();
    const context: PipelineContext = {
      originalText: text,
      options,
      analysis: null as unknown as AnalysisResult,
      privacyScan: null as unknown as SecretDetectionResult,
      originalTokens: 0,
      tier0Candidate: null,
      aiCandidates: [],
      bestCandidate: null,
      fallbackCandidate: null,
      bestCandidatePassed: false,
      verificationResult: null,
      mode: 'server',
      startTime
    };

    // Determine mode early to pick correct deadline
    const isForceTargetMode = options.safeResultMode === false;
    const deadlineMs = isForceTargetMode ? FORCE_TARGET_DEADLINE_MS : OVERALL_DEADLINE_MS;

    // Map compression target to numeric ratios if not explicitly provided
    if (options.compressionTarget && options.targetReductionRatio === undefined) {
      const targetMap: Record<string, number> = {
        conservative: 0.20,
        balanced: 0.35,
        aggressive: 0.50,
        extreme: 0.75
      };
      const boundsMap: Record<string, [number, number]> = {
        conservative: [0.17, 0.23],
        balanced: [0.30, 0.40],
        aggressive: [0.45, 0.55],
        extreme: [0.68, 0.80]
      };
      
      options.targetReductionRatio = targetMap[options.compressionTarget] || 0.35;
      const bounds = boundsMap[options.compressionTarget] || [0.30, 0.40];
      
      if (options.minimumReductionRatio === undefined) {
        options.minimumReductionRatio = bounds[0];
      }
      if (options.maximumReductionRatio === undefined) {
        options.maximumReductionRatio = bounds[1];
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), deadlineMs);

    const runPipeline = async (signal: AbortSignal): Promise<CompressionResult> => {
      // Step 1: Analyze input
      context.analysis = await this.analyzer.analyze(text);
      context.originalTokens = await this.countTokens(text, options.targetModel);

      // Step 2: Privacy scan (Fail fast if secrets are found)
      context.privacyScan = this.privacyDetector.scan(text);
      
      const privacySettings = this.config.privacySettings || { neverSendSecrets: true };
      if (context.privacyScan.hasSecrets && privacySettings.neverSendSecrets) {
        throw new TokenTrimError(
          'Secrets detected in prompt. Compression aborted.',
          'SECRETS_DETECTED',
          'privacy',
          false,
          { secretTypes: Array.from(new Set(context.privacyScan.secrets.map(s => s.type))) }
        );
      }

      // Step 3: Tier 0 deterministic compression (Server-side)
      context.tier0Candidate = await this.tier0Compressor.compress(text, options);
      
      let bestDeterministic: CompressionCandidate | null = context.tier0Candidate;
      const proseFallback = this.deterministicProseCompressionFallback(context);
      
      if (proseFallback) {
         // Prefer proseFallback if tier0 doesn't exist, or if it provides better net savings (while being deterministic)
         if (!bestDeterministic || proseFallback.netTokenSavings > bestDeterministic.netTokenSavings) {
             bestDeterministic = proseFallback;
         }
      }

      if (bestDeterministic) {
        const verified = await this.verifyCandidate(context, bestDeterministic);
        if (isForceTargetMode) {
          // Even if it's not in target range, we keep it as fallbackCandidate
          context.fallbackCandidate = bestDeterministic;
          if (this.isInTargetRange(bestDeterministic, context.originalTokens, options)) {
            context.bestCandidate = bestDeterministic;
            context.bestCandidatePassed = true;
            context.forcedTargetResult = !verified.passed;
            context.mode = 'server';
          }
        } else {
          if (verified.passed) {
            bestDeterministic.safetyScores = verified.scores;
            context.fallbackCandidate = bestDeterministic;
            context.bestCandidate = bestDeterministic;
            context.bestCandidatePassed = true;
            context.mode = 'server';
          }
        }
      }

      // Step 4: AI Compression with Groq (if Tier 0 not sufficient)
      const shouldTryCloud = this.shouldTryAICompression(context, options) && this.groqProvider;
      
      if (shouldTryCloud) {
        context.mode = 'cloud';
        
        try {
          context.aiCandidates = await this.aiCompressor.generateCandidates(text, {
            provider: this.groqProvider!,
            analysis: context.analysis,
            targetModel: options.targetModel,
            compressionTarget: options.compressionTarget,
            targetReductionRatio: options.targetReductionRatio,
            minimumReductionRatio: options.minimumReductionRatio,
            maximumReductionRatio: options.maximumReductionRatio,
            safeResultMode: options.safeResultMode,
            signal: controller.signal
          });
    
          for (const candidate of context.aiCandidates) {
            const verified = await this.verifyCandidate(context, candidate);
            
            if (isForceTargetMode) {
              // Force Target Mode: Must be in target range. Verification is NOT a blocker.
              if (this.isInTargetRange(candidate, context.originalTokens, options)) {
                candidate.safetyScores = verified.scores; // Update with accurate scores
                if (this.isBetterCandidate(candidate, context.bestCandidate, context.originalTokens, options)) {
                  context.bestCandidate = candidate;
                  context.bestCandidatePassed = true;
                  context.forcedTargetResult = !verified.passed;
                }
              }
            } else {
              // Safe Result Mode: MUST pass verification to be accepted (even if it's a fallback)
              if (verified.passed) {
                candidate.safetyScores = verified.scores; // Update with rigorous verification scores!
                if (this.isBetterCandidate(candidate, context.bestCandidate, context.originalTokens, options)) {
                  context.bestCandidate = candidate;
                  context.bestCandidatePassed = true;
                }
              }
            }
          }
        } catch (error) {
          console.error('[TokenTrim] Cloud AI compression (Groq) failed:', error);
          if (error instanceof Error) {
            context.cloudError = error;
          }
          // Non-fatal, we can still fall back to Tier 0 if it was successful
        }
      }

      // Step 4b: Fallbacks
      if (context.cloudError && !context.bestCandidate && context.fallbackCandidate) {
        // AI failed, but we have a valid deterministic fallback
        context.bestCandidate = context.fallbackCandidate;
        context.bestCandidatePassed = true;
        context.mode = 'server';
        if (isForceTargetMode) {
           context.forcedTargetResult = true;
        }
      } else if (isForceTargetMode && !context.bestCandidate) {
        // When Force Target Mode has no in-range candidate, fall back to the best
        // shorter result so we never return "No candidates generated."
        context.bestCandidate = this.selectForceTargetFallback(context, options);
        if (context.bestCandidate) {
          context.bestCandidatePassed = true;
          context.forcedTargetResult = true;
        }
      }

      // Step 5: Final acceptance check
      const finalResult = await this.buildResult(context, startTime);
      
      // Record telemetry
      this.telemetry.recordCompression(finalResult);

      return finalResult;
    };

    try {
      return await runPipeline(controller.signal);
    } catch (error) {
      if (error instanceof TokenTrimError) {
        throw error;
      }
      console.error('[TokenTrim] Compression error:', error);
      return this.buildErrorResult(text, context.originalTokens, options, startTime, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private shouldTryAICompression(context: PipelineContext, options: CompressionOptions): boolean {
    if (context.originalTokens < 20) return false;
    
    if (context.tier0Candidate) {
      const tier0Ratio = context.tier0Candidate.grossTokenReduction / context.originalTokens;
      const minimumRatio = options.minimumReductionRatio
        ?? (options.maxCompressionRatio ? options.maxCompressionRatio * 0.5 : 0.15);
      const maximumRatio = options.maximumReductionRatio ?? 1;
      const isWithinRequestedRange = tier0Ratio >= minimumRatio && tier0Ratio <= maximumRatio;
      if (isWithinRequestedRange && context.tier0Candidate.safetyScores.overall > 0.9) {
        return false;
      }
    }
    
    if (context.analysis.complexity === 'high') return true;
    if (context.analysis.contentType === 'coding_prompt') return true;
    if (context.analysis.hasCodeBlocks) return true;
    
    return true;
  }

  private async verifyCandidate(
    context: PipelineContext,
    candidate: CompressionCandidate
  ): Promise<import('@tokentrim/verifier').VerificationResult> {
    const result = await this.verifier.verify(
      context.originalText,
      candidate.compressedText,
      candidate.safetyScores,
      context.options.verificationThresholds
    );
    
    context.verificationResult = result;
    return result;
  }

  private isBetterCandidate(
    candidate: CompressionCandidate,
    currentBest: CompressionCandidate | null,
    originalTokens: number,
    options: CompressionOptions
  ): boolean {
    if (candidate.grossTokenReduction <= 0) return false;
    if (!currentBest) return true;

    const targetRatio = options.targetReductionRatio;
    
    if (targetRatio !== undefined && originalTokens > 0) {
      const candidateRatio = candidate.grossTokenReduction / originalTokens;
      const currentBestRatio = currentBest.grossTokenReduction / originalTokens;
      const candidateDistance = Math.abs(candidateRatio - targetRatio);
      const currentBestDistance = Math.abs(currentBestRatio - targetRatio);

      const minimumRatio = options.minimumReductionRatio ?? 0;
      const maximumRatio = options.maximumReductionRatio ?? 1;
      const candidateIsInRange = candidateRatio >= minimumRatio && candidateRatio <= maximumRatio;
      const currentBestIsInRange = currentBestRatio >= minimumRatio && currentBestRatio <= maximumRatio;

      // 1. Prefer candidates inside the selected acceptable reduction range
      if (candidateIsInRange !== currentBestIsInRange) {
        return candidateIsInRange;
      }

      // 2. Among valid candidates, choose the candidate with the smallest absolute difference from targetOutputTokens
      if (Math.abs(candidateDistance - currentBestDistance) > 0.005) {
        return candidateDistance < currentBestDistance;
      }
    }
    
    // 3. Then use semantic safety score
    if (candidate.safetyScores.overall !== currentBest.safetyScores.overall) {
      return candidate.safetyScores.overall > currentBest.safetyScores.overall;
    }

    // 4. Then use instruction/technical preservation
    if (candidate.safetyScores.instructionConfidence !== currentBest.safetyScores.instructionConfidence) {
      return candidate.safetyScores.instructionConfidence > currentBest.safetyScores.instructionConfidence;
    }
    if (candidate.safetyScores.technicalIntegrity !== currentBest.safetyScores.technicalIntegrity) {
      return candidate.safetyScores.technicalIntegrity > currentBest.safetyScores.technicalIntegrity;
    }
    
    // 5. Better net savings
    if (candidate.netTokenSavings !== currentBest.netTokenSavings) {
      return candidate.netTokenSavings > currentBest.netTokenSavings;
    }
    
    if (candidate.tier !== currentBest.tier) {
      const tierOrder: Record<CompressionTier, number> = { tier0: 2, cloud_ai: 1, deterministic: 2 };
      return tierOrder[candidate.tier] > tierOrder[currentBest.tier];
    }
    
    return false;
  }

  private async buildResult(context: PipelineContext, startTime: number): Promise<CompressionResult> {
    const processingTimeMs = Date.now() - startTime;
    const isForceTargetMode = context.options.safeResultMode === false;
    
    // Extract Force Target diagnostics from candidates
    const forceTargetDiagnostics = this.extractForceTargetDiagnostics(context.aiCandidates);
    
    if (!context.bestCandidate) {
      const noCandidatesGenerated = context.aiCandidates.length === 0 && !context.tier0Candidate;
      
      if (isForceTargetMode) {
        const targetPercent = (context.options.targetReductionRatio ?? 0.5) * 100;
        const minPercent = (context.options.minimumReductionRatio ?? 0) * 100;
        const maxPercent = (context.options.maximumReductionRatio ?? 1) * 100;
        
        // Check if we have a provider error
        if (context.cloudError) {
          return this.buildProviderErrorResult(context, targetPercent, minPercent, maxPercent, processingTimeMs);
        }
        
        // Build detailed rejection reason with diagnostics
        const rejectionReason = this.buildForceTargetRejectionReason(
          targetPercent,
          minPercent,
          maxPercent,
          forceTargetDiagnostics,
          context.aiCandidates.length,
          noCandidatesGenerated
        );
        
        return {
          originalText: context.originalText,
          bestCandidate: null,
          allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
          accepted: false,
          rejectionReason,
          processingTimeMs,
          originalTokens: context.originalTokens,
          finalTokens: context.originalTokens,
          grossReduction: 0,
          compressionOverhead: 0,
          netSavings: 0,
          provider: 'deterministic',
          mode: context.mode
        };
      }

      let rejectionReason = 'No candidate passed verification';
      if (context.verificationResult && !context.verificationResult.passed) {
        const failedDetail = context.verificationResult.details.find(d => !d.passed);
        if (failedDetail) {
          rejectionReason = failedDetail.message;
        }
      } else if (context.cloudError) {
        rejectionReason = this.sanitizeProviderError(context.cloudError);
      } else if (noCandidatesGenerated) {
        rejectionReason = 'No compressible patterns found';
      }

      return {
        originalText: context.originalText,
        bestCandidate: null,
        allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
        accepted: false,
        rejectionReason,
        processingTimeMs,
        originalTokens: context.originalTokens,
        finalTokens: context.originalTokens,
        grossReduction: 0,
        compressionOverhead: 0,
        netSavings: 0,
        provider: 'deterministic',
        mode: context.mode
      };
    }

    // Re-count tokens on the actual compressed text for accuracy
    const actualCompressedTokens = await this.countTokens(
      context.bestCandidate.compressedText,
      context.options.targetModel
    );
    const actualGrossReduction = context.originalTokens - actualCompressedTokens;
    const finalTokens = actualCompressedTokens;

    // In Force Target Mode, candidate selection already guarantees the target
    // range. Verification failures are warnings, rather than rejection reasons.
    const isAccepted = context.bestCandidatePassed;

    // Determine if this is a fallback (accepted but outside target range)
    let isFallbackResult = false;
    let reductionRatio = 0;
    if (isAccepted && context.originalTokens > 0) {
      reductionRatio = actualGrossReduction / context.originalTokens;
      const min = context.options.minimumReductionRatio ?? 0;
      const max = context.options.maximumReductionRatio ?? 1;
      isFallbackResult = reductionRatio < (min - 0.001) || reductionRatio > (max + 0.001); // Added slight epsilon for float rounding
    }

    let rejectionReason: string | undefined;
    if (!isAccepted) {
      if (isForceTargetMode) {
        const targetPercent = (context.options.targetReductionRatio ?? 0.5) * 100;
        rejectionReason = `Unable to meet the ${Math.round(targetPercent)}% reduction target within the accepted range.`;
      } else if (context.cloudError) {
        // Provider failed - this is NOT a safety trade-off, it's a provider failure
        rejectionReason = `AI compression failed: ${this.sanitizeProviderError(context.cloudError)}`;
      } else if (context.verificationResult && !context.verificationResult.passed) {
        const firstFailure = context.verificationResult.details[0];
        rejectionReason = firstFailure?.message ?? 'No candidate passed verification';
      } else {
        rejectionReason = 'No candidate passed verification';
      }
    } else if (isFallbackResult) {
      const actualPercent = +(reductionRatio * 100).toFixed(1);
      const targetPercent = Math.round((context.options.targetReductionRatio ?? 0.5) * 100);
      const minPercent = Math.round((context.options.minimumReductionRatio ?? 0) * 100);
      const maxPercent = Math.round((context.options.maximumReductionRatio ?? 1) * 100);
      const targetName = context.options.compressionTarget 
        ? context.options.compressionTarget.charAt(0).toUpperCase() + context.options.compressionTarget.slice(1) 
        : 'Custom';
      
      const diff = actualPercent > maxPercent 
        ? `over target by ${(actualPercent - targetPercent).toFixed(1)}%` 
        : `under target by ${(targetPercent - actualPercent).toFixed(1)}%`;
        
      rejectionReason = `Closest available result. ${targetName} target: ${targetPercent}% (acceptable: ${minPercent}–${maxPercent}%). Actual: ${actualPercent}% — ${diff}.`;
    }

    let fallbackReason: string | undefined;
    if (isAccepted && context.cloudError && context.bestCandidate.provider === 'deterministic') {
       if (context.cloudError.message.toLowerCase().includes('timeout')) {
         fallbackReason = 'AI timeout';
       } else {
         fallbackReason = 'AI unavailable';
       }
    }

    return {
      originalText: context.originalText,
      bestCandidate: context.bestCandidate,
      allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
      accepted: isAccepted,
      rejectionReason,
      processingTimeMs,
      originalTokens: context.originalTokens,
      finalTokens,
      grossReduction: actualGrossReduction,
      compressionOverhead: context.bestCandidate.compressionOverhead,
      netSavings: actualGrossReduction - context.bestCandidate.compressionOverhead,
      provider: context.bestCandidate.provider,
      mode: context.mode,
      forcedTargetResult: context.forcedTargetResult,
      fallbackReason
    };
  }

  private buildErrorResult(
    text: string,
    originalTokens: number,
    options: CompressionOptions,
    startTime: number,
    error: unknown
  ): CompressionResult {
    let rejectionReason = 'Unknown error';
    if (error instanceof TokenTrimError) {
      rejectionReason = error.message;
    } else if (error instanceof Error) {
      rejectionReason = error.message;
    }

    return {
      originalText: text,
      bestCandidate: null,
      allCandidates: [],
      accepted: false,
      rejectionReason,
      processingTimeMs: Date.now() - startTime,
      originalTokens,
      finalTokens: originalTokens,
      grossReduction: 0,
      compressionOverhead: 0,
      netSavings: 0,
      provider: 'deterministic',
      mode: 'server'
    };
  }


  async countTokens(text: string, model: TargetModel): Promise<number> {
    const result = await tokenizerRegistry.countTokens(text, createTokenizerConfig(model));
    return result.tokens;
  }

  /**
   * Initialize the engine and validate Groq provider configuration.
   * Throws TokenTrimError if Groq is configured but model is invalid or unavailable.
   */
  async initialize(): Promise<void> {
    if (this.groqProvider) {
      const health = await this.groqProvider.healthCheck();
      if (!health.healthy) {
        const errorMsg = health.error ?? 'Groq health check failed';
        const modelAvailable = health.modelAvailable ?? false;
        
        if (!modelAvailable) {
          throw new TokenTrimError(
            `Groq model "${this.config.groqConfig?.model}" is not available. Please check the model ID at console.groq.com/docs/models`,
            'INVALID_MODEL',
            'configuration',
            false,
            { model: this.config.groqConfig?.model, error: errorMsg }
          );
        }
        
        throw new TokenTrimError(
          `Groq provider unhealthy: ${errorMsg}`,
          'PROVIDER_UNAVAILABLE',
          'provider',
          true,
          { error: errorMsg }
        );
      }
    }
  }

  async healthCheck(): Promise<Record<string, import('@tokentrim/providers').ProviderHealth>> {
    const results: Record<string, import('@tokentrim/providers').ProviderHealth> = {};
    
    if (this.groqProvider) {
      results['groq'] = await this.groqProvider.healthCheck();
    }
    
    return results;
  }

  getAvailableProviders(): ProviderType[] {
    const providers: ProviderType[] = ['deterministic'];
    if (this.groqProvider) providers.push('groq');
    return providers;
  }

  updateConfig(config: Partial<TokenTrimEngineConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.groqConfig && this.groqProvider) {
      this.groqProvider.updateConfig(config.groqConfig);
    }
    
    if (config.verificationThresholds) {
      this.verifier.setThresholds(config.verificationThresholds);
    }
    
    if (config.targetModel) {
      this.analyzer.setTargetModel(config.targetModel);
    }
  }

  getTelemetry(): Telemetry {
    return this.telemetry;
  }

  private extractForceTargetDiagnostics(candidates: CompressionCandidate[]): ForceTargetDiagnostics | null {
    for (const candidate of candidates) {
      const metadata = candidate.metadata ?? {};
      const diagnostics = metadata['forceTargetDiagnostics'] as ForceTargetDiagnostics | undefined;
      if (diagnostics) {
        return diagnostics;
      }
    }
    return null;
  }

  private buildProviderErrorResult(
    context: PipelineContext,
    targetPercent: number,
    minPercent: number,
    maxPercent: number,
    processingTimeMs: number
  ): CompressionResult {
    const provider = this.groqProvider ? 'groq' : 'deterministic';
    const errorMessage = context.cloudError?.message ?? 'Unknown provider error';
    const sanitizedError = this.sanitizeProviderError(context.cloudError);
    
    return {
      originalText: context.originalText,
      bestCandidate: null,
      allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
      accepted: false,
      rejectionReason: `Provider error (${provider}): ${sanitizedError}. Target was ${Math.round(targetPercent)}% reduction (${Math.round(minPercent)}-${Math.round(maxPercent)}% range).`,
      processingTimeMs,
      originalTokens: context.originalTokens,
      finalTokens: context.originalTokens,
      grossReduction: 0,
      compressionOverhead: 0,
      netSavings: 0,
      provider: 'deterministic',
      mode: context.mode
    };
  }

  private sanitizeProviderError(error: Error | undefined): string {
    if (!error) return 'Unknown provider error';
    const message = error.message;
    // Sanitize common sensitive patterns
    return message
      .replace(/Bearer\s+[a-zA-Z0-9-_]+/gi, 'Bearer [REDACTED]')
      .replace(/api[_-]?key["\s:=]+[a-zA-Z0-9-_]+/gi, 'api_key=[REDACTED]')
      .replace(/secret["\s:=]+[a-zA-Z0-9-_]+/gi, 'secret=[REDACTED]')
      .replace(/token["\s:=]+[a-zA-Z0-9-_]+/gi, 'token=[REDACTED]');
  }

  private buildForceTargetRejectionReason(
    targetPercent: number,
    minPercent: number,
    maxPercent: number,
    diagnostics: ForceTargetDiagnostics | null,
    candidateCount: number,
    noCandidatesGenerated: boolean
  ): string {
    if (noCandidatesGenerated) {
      return `Unable to meet the ${Math.round(targetPercent)}% reduction target (${Math.round(minPercent)}-${Math.round(maxPercent)}% range). No candidates were generated.`;
    }

    if (!diagnostics) {
      return `Unable to meet the ${Math.round(targetPercent)}% reduction target (${Math.round(minPercent)}-${Math.round(maxPercent)}% range). Generated ${candidateCount} candidate(s) but none met the target range.`;
    }

    const { attempts, closestAttempt, finalStatus } = diagnostics;
    const totalAttempts = attempts.length;

    if (finalStatus === 'provider_failure') {
      const providerErrors = attempts.filter(a => a.status === 'provider_error');
      return `Provider failure after ${totalAttempts} attempt(s). Target: ${Math.round(targetPercent)}% (${Math.round(minPercent)}-${Math.round(maxPercent)}% range).`;
    }

    if (finalStatus === 'impossible_target') {
      return `Target impossible due to token granularity. Original: ${diagnostics.originalTokens} tokens. Required range: ${diagnostics.minOutputTokens}-${diagnostics.maxOutputTokens} output tokens.`;
    }

    if (closestAttempt) {
      const achievedPercent = Math.round(closestAttempt.reductionRatio * 100);
      const status = closestAttempt.status;
      const statusText = status === 'under_compressed' ? 'under-compressed' : status === 'over_compressed' ? 'over-compressed' : 'out of range';
      
      return `Generated ${totalAttempts} candidate(s); closest achieved ${achievedPercent}% reduction (${statusText}). Target requires ${Math.round(minPercent)}-${Math.round(maxPercent)}% reduction.`;
    }

    return `Unable to meet the ${Math.round(targetPercent)}% reduction target (${Math.round(minPercent)}-${Math.round(maxPercent)}% range). Generated ${totalAttempts} candidate(s); none met target.`;
  }

  /**
   * Force Target Mode fallback cascade.
   * Priority: 1) AI candidate closest to target  2) Tier 0 candidate  3) deterministic prose compression
   * Returns null only when the input is genuinely non-compressible.
   */
  private selectForceTargetFallback(
    context: PipelineContext,
    options: CompressionOptions
  ): CompressionCandidate | null {
    const targetRatio = options.targetReductionRatio ?? 0.35;

    // 1. Pick the AI candidate closest to the target (must be shorter than original)
    let closest: CompressionCandidate | null = null;
    let closestDistance = Infinity;
    for (const candidate of context.aiCandidates) {
      if (candidate.grossTokenReduction <= 0) continue; // skip if not shorter
      const ratio = candidate.grossTokenReduction / context.originalTokens;
      const dist = Math.abs(ratio - targetRatio);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = candidate;
      }
    }
    if (closest) return closest;

    // 2. Use the Tier 0 deterministic candidate
    if (context.tier0Candidate && context.tier0Candidate.grossTokenReduction > 0) {
      return context.tier0Candidate;
    }

    // 3. Guaranteed deterministic prose-compression fallback
    return this.deterministicProseCompressionFallback(context);
  }

  /**
   * Guaranteed deterministic prose-compression fallback that removes filler,
   * duplicate wording, repeated phrases, weak intensifiers, and redundant clauses.
   * Returns null only when the text is genuinely non-compressible.
   */
  private deterministicProseCompressionFallback(
    context: PipelineContext
  ): CompressionCandidate | null {
    let compressed = context.originalText;

    // Remove filler / weak intensifiers
    const fillerPatterns = [
      /\b(?:in my opinion,?|i personally|personally|i think that|i believe that|first and foremost,?)\s*/gi,
      /\b(?:basically|actually|literally|really|very|quite|rather|somewhat|honestly|frankly|clearly)\s+/gi,
      /\b(?:kind of|sort of|pretty much|in general|generally speaking|for the most part|more or less|as a matter of fact)\s*/gi,
      /\b(?:complete and total|each and every|first and foremost|basic fundamentals|past history|end result|final outcome|honest truth|advance planning|plan in advance)\b/gi,
      /\b(?:in order to|so as to|due to the fact that|because of the fact that|the fact that|the reason why|the way in which)\s*/gi,
      /\b(?:it is important to note that|it should be noted that|at this point in time|at the present time)\s*/gi,
      /\b(?:and that'?s the honest truth|and that is the honest truth)\s*/gi,
    ];

    // Deduplicate redundant paired phrases
    const redundantPairs: [RegExp, string][] = [
      [/\bcomplete and total\b/gi, 'total'],
      [/\bbasic fundamentals\b/gi, 'fundamentals'],
      [/\bpast history\b/gi, 'history'],
      [/\bend result\b/gi, 'result'],
      [/\bfinal outcome\b/gi, 'outcome'],
      [/\bhonest truth\b/gi, 'truth'],
      [/\bplan in advance\b/gi, 'plan'],
      [/\badvance planning\b/gi, 'planning'],
      [/\beach and every\b/gi, 'every'],
      [/\bfirst and foremost\b/gi, 'first'],
    ];

    for (const [pattern, replacement] of redundantPairs) {
      compressed = compressed.replace(pattern, replacement);
    }

    for (const pattern of fillerPatterns) {
      compressed = compressed.replace(pattern, '');
    }

    // Normalize whitespace
    compressed = compressed.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

    // Capitalize first letter if needed
    if (compressed.length > 0 && compressed.charAt(0) !== compressed.charAt(0).toUpperCase()) {
      compressed = compressed.charAt(0).toUpperCase() + compressed.slice(1);
    }

    // Only return if actually shorter
    if (compressed.length >= context.originalText.length || compressed === context.originalText) {
      return null;
    }

    // Estimate token reduction (rough: 4 chars ≈ 1 token)
    const estimatedOriginalTokens = context.originalTokens;
    const estimatedCompressedTokens = Math.ceil(compressed.length / 4);
    const grossReduction = Math.max(0, estimatedOriginalTokens - estimatedCompressedTokens);

    if (grossReduction <= 0) return null;

    return {
      id: `fallback-prose-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      originalText: context.originalText,
      compressedText: compressed,
      tier: 'deterministic',
      provider: 'deterministic',
      grossTokenReduction: grossReduction,
      compressionOverhead: 0,
      netTokenSavings: grossReduction,
      safetyScores: {
        semanticConfidence: 0.85,
        instructionConfidence: 0.90,
        technicalIntegrity: 1.0,
        privacyConfidence: 1.0,
        compressionConfidence: 0.80,
        overall: 0.89
      },
      timestamp: Date.now(),
      metadata: {
        fallbackType: 'deterministic_prose_compression'
      }
    };
  }
}
