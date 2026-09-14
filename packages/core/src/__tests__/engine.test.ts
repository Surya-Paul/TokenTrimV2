import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenTrimEngine } from '../engine';
import { TokenTrimEngineConfig } from '../engine';
import { CompressionOptions, TargetModel, AnalysisResult, CompressionCandidate, CompressionTier, ProviderType, SafetyScores, SecretDetectionResult, VerificationResult, VerificationDetail, SafetyCheckType } from '@tokentrim/shared';
import { LLMProvider, ProviderResponse, GenerateOptions, ProviderHealth, ProviderCapabilities, ProviderStatus } from '@tokentrim/providers';

// Mock provider that returns a valid candidate
class MockProvider implements LLMProvider {
  name = 'Mock';
  type: ProviderType = 'ollama';
  private response: ProviderResponse;
  private shouldFail = false;

  constructor(response: ProviderResponse, type: ProviderType = 'ollama') {
    this.response = response;
    this.type = type;
  }

  setFail(fail: boolean) {
    this.shouldFail = fail;
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    if (this.shouldFail) throw new Error('Mock provider failure');
    return this.response;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: true, lastChecked: Date.now() };
  }

  getModel(): string {
    return 'mock-model';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: false,
      jsonMode: false,
      functionCalling: false,
      maxContextTokens: 4096,
      supportedModels: ['mock-model']
    };
  }

  estimateCost(): number {
    return 0;
  }

  getStatus(): ProviderStatus {
    return 'available';
  }
}

// Mock analyzer
const mockAnalysis: AnalysisResult = {
  contentType: 'coding_prompt',
  semanticComponents: [],
  complexity: 'medium',
  estimatedTokens: 100,
  hasCodeBlocks: false,
  hasInlineCode: false,
  hasUrls: false,
  hasSecrets: false,
  protectedSegments: [],
  structure: 'flat'
};

// Mock privacy scan
const mockPrivacyScan: SecretDetectionResult = {
  hasSecrets: false,
  secrets: [],
  riskLevel: 'none'
};

// Mock safety scores that pass verification
const passingSafetyScores: SafetyScores = {
  semanticConfidence: 0.95,
  instructionConfidence: 0.95,
  technicalIntegrity: 0.95,
  privacyConfidence: 1.0,
  compressionConfidence: 0.9,
  overall: 0.95
};

// Mock passing verification result
const passingVerification: VerificationResult = {
  passed: true,
  scores: passingSafetyScores,
  details: [],
  failedChecks: []
};

describe('TokenTrimEngine - forceCloud', () => {
  let engine: TokenTrimEngine;
  let mockOllamaProvider: MockProvider;
  let mockGroqProvider: MockProvider;

  beforeEach(() => {
    // Create mock providers that return valid candidates
    const ollamaResponse: ProviderResponse = {
      text: 'Compressed by Ollama',
      inputTokens: 50,
      outputTokens: 30,
      model: 'phi4-mini',
      finishReason: 'stop'
    };

    const groqResponse: ProviderResponse = {
      text: 'Compressed by Groq',
      inputTokens: 50,
      outputTokens: 25,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    };

    mockOllamaProvider = new MockProvider(ollamaResponse, 'ollama');
    mockGroqProvider = new MockProvider(groqResponse, 'groq');

    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      ollamaConfig: { baseUrl: 'http://localhost:11434', model: 'phi4-mini', timeoutMs: 30000 },
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', baseUrl: 'https://api.groq.com', timeoutMs: 30000, maxRetries: 3, retryDelayMs: 1000 },
      enableTelemetry: false,
      privacySettings: {
        neverSendSecrets: true,
        allowCloudProcessing: true,
        requireCloudConfirmation: false,
        maskSecretsInLogs: true,
        localOnlyMode: false
      }
    };

    engine = new TokenTrimEngine(config);
    
    // Replace providers with mocks
    (engine as any).ollamaProvider = mockOllamaProvider;
    (engine as any).groqProvider = mockGroqProvider;
    
    // Mock analyzer to return simple analysis
    (engine as any).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    
    // Mock privacy detector
    (engine as any).privacyDetector = {
      scan: vi.fn().mockReturnValue(mockPrivacyScan)
    };
    
    // Mock tokenizer
    (engine as any).countTokens = vi.fn().mockResolvedValue(100);
    
    // Mock tier0 compressor to return a candidate that passes verification
    (engine as any).tier0Compressor = {
      compress: vi.fn().mockResolvedValue({
        id: 'tier0-test',
        originalText: 'test',
        compressedText: 'Compressed by Tier 0',
        tier: 'tier0',
        provider: 'deterministic',
        grossTokenReduction: 20,
        compressionOverhead: 0,
        netTokenSavings: 20,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      })
    };
    
    // Mock AI compressor to return candidates
    const createMockCandidates = (providerType: ProviderType, providerName: string) => [
      {
        id: `ai-${providerType}-test`,
        originalText: 'test',
        compressedText: `Compressed by ${providerName}`,
        tier: providerType === 'groq' ? 'cloud_ai' : 'local_ai',
        provider: providerType,
        model: providerName,
        grossTokenReduction: 40,
        compressionOverhead: 10,
        netTokenSavings: 30,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }
    ];
    
    (engine as any).aiCompressor = {
      generateCandidates: vi.fn().mockImplementation(async (text: string, opts: any) => {
        return createMockCandidates(opts.provider.type, opts.provider.getModel());
      })
    };
    
    // Mock verifier to always pass
    (engine as any).verifier = {
      verify: vi.fn().mockResolvedValue(passingVerification),
      setThresholds: vi.fn()
    };
  });

  it('should return groq provider when forceCloud=true and both local and cloud succeed', async () => {
    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      allowCloudFallback: true,
      forceCloud: true,
      forceLocal: false
    };

    const result = await engine.compress('Test prompt for compression', options);

    expect(result.accepted).toBe(true);
    expect(result.provider).toBe('groq');
    expect(result.mode).toBe('cloud');
    expect(result.bestCandidate?.provider).toBe('groq');
    expect(result.bestCandidate?.tier).toBe('cloud_ai');
  });

  it('should skip local compression when forceCloud=true', async () => {
    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      allowCloudFallback: true,
      forceCloud: true,
      forceLocal: false
    };

    const result = await engine.compress('Test prompt for compression', options);

    // With forceCloud, local (Ollama) should not be called
    // The result should come from Groq
    expect(result.provider).toBe('groq');
    expect(result.mode).toBe('cloud');
  });

  it('should use local provider when forceLocal=true even if cloud is available', async () => {
    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      allowCloudFallback: true,
      forceCloud: false,
      forceLocal: true
    };

    const result = await engine.compress('Test prompt for compression', options);

    // With forceLocal, cloud should not be tried
    // Result should be from local (deterministic or Ollama)
    expect(result.mode).toBe('local');
    expect(result.provider).not.toBe('groq');
  });

  it('should use local-first fallback when neither forceCloud nor forceLocal (auto mode)', async () => {
    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      allowCloudFallback: true,
      forceCloud: false,
      forceLocal: false
    };

    const result = await engine.compress('Test prompt for compression', options);

    // In auto mode, local runs first, cloud only if local fails
    // Since our mock Ollama returns a valid candidate, local should win
    expect(result.mode).toBe('local');
  });
});