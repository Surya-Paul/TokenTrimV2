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

interface PipelineContext {
  originalText: string;
  options: CompressionOptions;
  analysis: AnalysisResult;
  privacyScan: SecretDetectionResult;
  originalTokens: number;
  tier0Candidate: CompressionCandidate | null;
  aiCandidates: CompressionCandidate[];
  bestCandidate: CompressionCandidate | null;
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
      bestCandidatePassed: false,
      verificationResult: null,
      mode: 'server',
      startTime
    };

    try {
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

      const isForceTargetMode = options.safeResultMode === false;

      // Step 3: Tier 0 deterministic compression (Server-side)
      context.tier0Candidate = await this.tier0Compressor.compress(text, options);
      
      if (context.tier0Candidate) {
        const tier0Verified = await this.verifyCandidate(context, context.tier0Candidate);
        if (isForceTargetMode) {
          if (this.isInTargetRange(context.tier0Candidate, context.originalTokens, options)) {
            context.bestCandidate = context.tier0Candidate;
            context.bestCandidatePassed = true;
            context.forcedTargetResult = !tier0Verified.passed;
            context.mode = 'server';
          }
        } else {
          if (tier0Verified.passed) {
            context.bestCandidate = context.tier0Candidate;
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
            safeResultMode: options.safeResultMode
          });
  
          for (const candidate of context.aiCandidates) {
            const verified = await this.verifyCandidate(context, candidate);
            
            if (isForceTargetMode) {
              // Force Target Mode: Must be in target range. Verification is NOT a blocker.
              if (this.isInTargetRange(candidate, context.originalTokens, options)) {
                if (this.isBetterCandidate(candidate, context.bestCandidate, context.originalTokens, options)) {
                  context.bestCandidate = candidate;
                  context.bestCandidatePassed = true;
                  context.forcedTargetResult = !verified.passed;
                }
              }
            } else {
              // Safe Result Mode: MUST pass verification to be accepted (even if it's a fallback)
              if (verified.passed) {
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

      // Step 5: Final acceptance check
      const finalResult = await this.buildResult(context, startTime);
      
      // Record telemetry
      this.telemetry.recordCompression(finalResult);

      return finalResult;
    } catch (error) {
      if (error instanceof TokenTrimError) {
        throw error;
      }
      console.error('[TokenTrim] Compression error:', error);
      return this.buildErrorResult(text, context.originalTokens, options, startTime, error);
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
    if (!currentBest) return true;

    const targetRatio = options.targetReductionRatio;
    const isForceTargetMode = options.safeResultMode === false;
    
    if (targetRatio !== undefined && originalTokens > 0) {
      const candidateRatio = candidate.grossTokenReduction / originalTokens;
      const currentBestRatio = currentBest.grossTokenReduction / originalTokens;
      const candidateDistance = Math.abs(candidateRatio - targetRatio);
      const currentBestDistance = Math.abs(currentBestRatio - targetRatio);

      if (isForceTargetMode) {
        // Rank by closeness to target in Force Target Mode
        if (Math.abs(candidateDistance - currentBestDistance) > 0.005) {
          return candidateDistance < currentBestDistance;
        }
      } else {
        const minimumRatio = options.minimumReductionRatio ?? 0;
        const maximumRatio = options.maximumReductionRatio ?? 1;
        const candidateIsInRange = candidateRatio >= minimumRatio && candidateRatio <= maximumRatio;
        const currentBestIsInRange = currentBestRatio >= minimumRatio && currentBestRatio <= maximumRatio;

        // A verified candidate that fulfils the chosen preset takes precedence.
        if (candidateIsInRange !== currentBestIsInRange) {
          return candidateIsInRange;
        }

        // Within (or outside) the range, select the result closest to the requested reduction.
        if (Math.abs(candidateDistance - currentBestDistance) > 0.005) {
          return candidateDistance < currentBestDistance;
        }
      }
    }
    
    if (candidate.safetyScores.overall !== currentBest.safetyScores.overall) {
      return candidate.safetyScores.overall > currentBest.safetyScores.overall;
    }
    
    if (candidate.grossTokenReduction !== currentBest.grossTokenReduction) {
      return candidate.grossTokenReduction > currentBest.grossTokenReduction;
    }

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

    // In Safe Result Mode, a verified candidate outside the target range is a safe fallback.
    // In Force Target Mode this cannot happen (out-of-range candidates are filtered earlier).

    let rejectionReason: string | undefined;
    if (!isAccepted) {
      if (isForceTargetMode) {
        const targetPercent = (context.options.targetReductionRatio ?? 0.5) * 100;
        rejectionReason = `Unable to meet the ${Math.round(targetPercent)}% reduction target within the accepted range.`;
      } else if (context.verificationResult && !context.verificationResult.passed) {
        const firstFailure = context.verificationResult.details[0];
        rejectionReason = firstFailure?.message ?? 'No candidate passed verification';
      } else if (context.cloudError) {
        rejectionReason = context.cloudError.message;
      } else {
        rejectionReason = 'No candidate passed verification';
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
      forcedTargetResult: context.forcedTargetResult
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
    const provider = context.options.targetModel;
    const errorMessage = context.cloudError?.message ?? 'Unknown provider error';
    const sanitizedError = this.sanitizeProviderError(context.cloudError);
    
    return {
      originalText: context.originalText,
      bestCandidate: null,
      allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
      accepted: false,
      rejectionReason: `Provider error (${provider}): ${sanitizedError}. Target was ${targetPercent}% reduction (${minPercent}-${maxPercent}% range).`,
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
}
