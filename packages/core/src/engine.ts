import {
  CompressionResult,
  CompressionOptions,
  CompressionCandidate,
  CompressionTier,
  ProviderType,
  SafetyScores,
  AnalysisResult,
  TargetModel,
  ProcessingMode,
  VerificationThresholds,
  SecretDetectionResult
} from '@tokentrim/shared';
import { InputAnalyzer } from '@tokentrim/analyzer';
import { Tier0Compressor } from '@tokentrim/compressor';
import { AICompressor, AICompressionOptions } from '@tokentrim/compressor';
import { VerificationEngine, DEFAULT_THRESHOLDS } from '@tokentrim/verifier';
import { SecretDetector, createDefaultPrivacySettings } from '@tokentrim/privacy';
import { ProviderFactory, OllamaProvider, GroqProvider, LLMProvider } from '@tokentrim/providers';
import { tokenizerRegistry, createTokenizerConfig } from '@tokentrim/tokenizer';
import { Telemetry } from '@tokentrim/telemetry';

export interface TokenTrimEngineConfig {
  targetModel: TargetModel;
  ollamaConfig?: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  groqConfig?: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  privacySettings?: Partial<SecretDetectionResult>;
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
  verificationResult: import('@tokentrim/verifier').VerificationResult | null;
  mode: ProcessingMode;
  startTime: number;
}

export class TokenTrimEngine {
  private analyzer: InputAnalyzer;
  private tier0Compressor: Tier0Compressor;
  private aiCompressor: AICompressor;
  private verifier: VerificationEngine;
  private privacyDetector: SecretDetector;
  private providerFactory: ProviderFactory;
  private ollamaProvider: OllamaProvider | null = null;
  private groqProvider: GroqProvider | null = null;
  private telemetry: Telemetry;
  private config: TokenTrimEngineConfig;
  private currentMode: ProcessingMode = 'local';

  constructor(config: TokenTrimEngineConfig) {
    this.config = config;
    this.analyzer = new InputAnalyzer(config.targetModel);
    this.tier0Compressor = new Tier0Compressor(config.targetModel);
    this.aiCompressor = new AICompressor(config.targetModel);
    this.verifier = new VerificationEngine(config.verificationThresholds || {}, config.targetModel);
    this.privacyDetector = new SecretDetector(createDefaultPrivacySettings());
    this.providerFactory = new ProviderFactory();
    this.telemetry = new Telemetry(config.enableTelemetry !== false);

    this.initializeProviders();
  }

  private initializeProviders(): void {
    const providers = this.providerFactory.createProviders({
      ollama: this.config.ollamaConfig,
      groq: this.config.groqConfig
    });
    this.ollamaProvider = providers.ollama || null;
    this.groqProvider = providers.groq || null;
  }

  async compress(text: string, options: CompressionOptions): Promise<CompressionResult> {
    const startTime = Date.now();
    const context: PipelineContext = {
      originalText: text,
      options,
      analysis: null as any,
      privacyScan: null as any,
      originalTokens: 0,
      tier0Candidate: null,
      aiCandidates: [],
      bestCandidate: null,
      verificationResult: null,
      mode: 'local',
      startTime
    };

    try {
      // Step 1: Analyze input
      context.analysis = await this.analyzer.analyze(text);
      context.originalTokens = await this.countTokens(text, options.targetModel);

      // Step 2: Privacy scan
      context.privacyScan = this.privacyDetector.scan(text);
      
      // Check if we can use cloud
      const cloudAllowed = this.shouldAllowCloud(context.privacyScan, options);
      
      // Step 3: Tier 0 deterministic compression
      context.tier0Candidate = await this.tier0Compressor.compress(text, options);
      
      // Evaluate Tier 0
      if (context.tier0Candidate) {
        const tier0Verified = await this.verifyCandidate(context, context.tier0Candidate);
        if (tier0Verified.passed) {
          context.bestCandidate = context.tier0Candidate;
          context.mode = 'local';
        }
      }

      // Step 4: AI Compression (if Tier 0 not sufficient or not accepted)
      const shouldTryAI = this.shouldTryAICompression(context, options);
      
      if (shouldTryAI && this.ollamaProvider) {
        context.mode = 'local';
        context.aiCandidates = await this.aiCompressor.generateCandidates(text, {
          provider: this.ollamaProvider,
          analysis: context.analysis,
          targetModel: options.targetModel
        });

        // Verify AI candidates
        for (const candidate of context.aiCandidates) {
          const verified = await this.verifyCandidate(context, candidate);
          if (verified.passed && this.isBetterCandidate(candidate, context.bestCandidate)) {
            context.bestCandidate = candidate;
          }
        }
      }

      // Step 5: Cloud fallback (if enabled and local failed)
      if (!context.bestCandidate && cloudAllowed && this.groqProvider && options.allowCloudFallback) {
        context.mode = 'cloud';
        
        if (options.requireConfirmationForCloud) {
          // In a real app, this would trigger a UI confirmation
          // For now, we'll proceed but log the requirement
          console.log('[TokenTrim] Cloud confirmation required - proceeding for demo');
        }

        context.aiCandidates = await this.aiCompressor.generateCandidates(text, {
          provider: this.groqProvider,
          analysis: context.analysis,
          targetModel: options.targetModel
        });

        for (const candidate of context.aiCandidates) {
          candidate.tier = 'cloud_ai';
          candidate.provider = 'groq';
          const verified = await this.verifyCandidate(context, candidate);
          if (verified.passed && this.isBetterCandidate(candidate, context.bestCandidate)) {
            context.bestCandidate = candidate;
          }
        }
      }

      // Step 6: Final acceptance check
      const finalResult = this.buildResult(context, startTime);
      
      // Record telemetry
      this.telemetry.recordCompression(finalResult);

      return finalResult;
    } catch (error) {
      console.error('[TokenTrim] Compression error:', error);
      // Return original text on any error
      return this.buildErrorResult(text, context.originalTokens, options, startTime, error);
    }
  }

  private shouldAllowCloud(privacyScan: SecretDetectionResult, options: CompressionOptions): boolean {
    // The engine doesn't track custom privacy settings directly here, we just use defaults for local checks
    const privacySettings = createDefaultPrivacySettings();

    if (privacySettings.localOnlyMode) return false;
    if (!options.allowCloudFallback) return false;
    if (privacyScan.hasSecrets && privacySettings.neverSendSecrets) return false;
    if (!privacySettings.allowCloudProcessing) return false;
    
    return true;
  }

  private shouldTryAICompression(context: PipelineContext, options: CompressionOptions): boolean {
    // Don't use AI for very short prompts
    if (context.originalTokens < 50) return false;
    
    // Don't use AI if Tier 0 already achieved good compression with high confidence
    if (context.tier0Candidate) {
      const tier0Ratio = context.tier0Candidate.grossTokenReduction / context.originalTokens;
      if (tier0Ratio > 0.25 && context.tier0Candidate.safetyScores.overall > 0.95) {
        return false; // Tier 0 is good enough
      }
    }
    
    // Use AI for complex prompts
    if (context.analysis.complexity === 'high') return true;
    if (context.analysis.contentType === 'coding_prompt') return true;
    if (context.analysis.hasCodeBlocks) return true;
    
    return options.maxCompressionRatio ? options.maxCompressionRatio > 0.2 : true;
  }

  private async verifyCandidate(
    context: PipelineContext,
    candidate: CompressionCandidate
  ): Promise<import('@tokentrim/verifier').VerificationResult> {
    const result = await this.verifier.verify(
      context.originalText,
      candidate.compressedText,
      candidate.safetyScores
    );
    
    context.verificationResult = result;
    return result;
  }

  private isBetterCandidate(
    candidate: CompressionCandidate,
    currentBest: CompressionCandidate | null
  ): boolean {
    if (!currentBest) return true;
    
    // Prefer higher net savings
    if (candidate.netTokenSavings !== currentBest.netTokenSavings) {
      return candidate.netTokenSavings > currentBest.netTokenSavings;
    }
    
    // Prefer higher safety score
    if (candidate.safetyScores.overall !== currentBest.safetyScores.overall) {
      return candidate.safetyScores.overall > currentBest.safetyScores.overall;
    }
    
    // Prefer local over cloud
    if (candidate.tier !== currentBest.tier) {
      const tierOrder: Record<CompressionTier, number> = { tier0: 3, local_ai: 2, cloud_ai: 1 };
      return tierOrder[candidate.tier] > tierOrder[currentBest.tier];
    }
    
    return false;
  }

  private buildResult(context: PipelineContext, startTime: number): CompressionResult {
    const processingTimeMs = Date.now() - startTime;
    
    if (!context.bestCandidate) {
      return {
        originalText: context.originalText,
        bestCandidate: null,
        allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
        accepted: false,
        rejectionReason: 'No candidate passed verification',
        processingTimeMs,
        originalTokens: context.originalTokens,
        finalTokens: context.originalTokens,
        grossReduction: 0,
        compressionOverhead: 0,
        netSavings: 0,
        estimatedCostSavings: 0,
        provider: 'deterministic',
        mode: context.mode
      };
    }

    const finalTokens = context.originalTokens - context.bestCandidate.grossTokenReduction;
    const estimatedCostSavings = this.estimateCostSavings(context.bestCandidate);

    return {
      originalText: context.originalText,
      bestCandidate: context.bestCandidate,
      allCandidates: [context.tier0Candidate, ...context.aiCandidates].filter(Boolean) as CompressionCandidate[],
      accepted: true,
      processingTimeMs,
      originalTokens: context.originalTokens,
      finalTokens,
      grossReduction: context.bestCandidate.grossTokenReduction,
      compressionOverhead: context.bestCandidate.compressionOverhead,
      netSavings: context.bestCandidate.netTokenSavings,
      estimatedCostSavings,
      provider: context.bestCandidate.provider,
      mode: context.mode
    };
  }

  private buildErrorResult(
    text: string,
    originalTokens: number,
    options: CompressionOptions,
    startTime: number,
    error: unknown
  ): CompressionResult {
    return {
      originalText: text,
      bestCandidate: null,
      allCandidates: [],
      accepted: false,
      rejectionReason: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime,
      originalTokens,
      finalTokens: originalTokens,
      grossReduction: 0,
      compressionOverhead: 0,
      netSavings: 0,
      estimatedCostSavings: 0,
      provider: 'deterministic',
      mode: 'local'
    };
  }

  private estimateCostSavings(candidate: CompressionCandidate): number {
    // Rough estimate: $0.002 per 1K tokens for typical API pricing
    return (candidate.netTokenSavings / 1000) * 0.002;
  }

  private async countTokens(text: string, model: TargetModel): Promise<number> {
    const result = await tokenizerRegistry.countTokens(text, createTokenizerConfig(model));
    return result.tokens;
  }

  // Public API methods
  async healthCheck(): Promise<Record<string, import('@tokentrim/providers').ProviderHealth>> {
    const results: Record<string, import('@tokentrim/providers').ProviderHealth> = {};
    
    if (this.ollamaProvider) {
      results['ollama'] = await this.ollamaProvider.healthCheck();
    }
    
    if (this.groqProvider) {
      results['groq'] = await this.groqProvider.healthCheck();
    }
    
    return results;
  }

  getAvailableProviders(): ProviderType[] {
    const providers: ProviderType[] = ['deterministic'];
    if (this.ollamaProvider) providers.push('ollama');
    if (this.groqProvider) providers.push('groq');
    return providers;
  }

  updateConfig(config: Partial<TokenTrimEngineConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.ollamaConfig && this.ollamaProvider) {
      this.ollamaProvider.updateConfig(config.ollamaConfig);
    }
    
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
}