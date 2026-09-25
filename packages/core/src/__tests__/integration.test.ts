import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenTrimEngine, TokenTrimEngineConfig } from '../engine';
import { CompressionOptions } from '@tokentrim/shared';
import { LLMProvider, ProviderResponse, GenerateOptions, ProviderHealth, ProviderCapabilities, ProviderStatus } from '@tokentrim/providers';
import { AnalysisResult, ProtectedSegment } from '@tokentrim/shared';

const PROSE_INPUT = "In my opinion, I personally think that, first and foremost, we need to plan in advance and take advance planning seriously, because the basic fundamentals of the past history of this project show that the end result and final outcome will be a complete and total success, and that's the honest truth.";

class MockProvider implements LLMProvider {
  name = 'Groq';
  type: 'groq' = 'groq';
  private response: ProviderResponse;

  constructor(response: ProviderResponse) {
    this.response = response;
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    return this.response;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: true, lastChecked: Date.now() };
  }

  getModel(): string {
    return 'llama-3.1-8b-instant';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: false,
      jsonMode: false,
      functionCalling: false,
      maxContextTokens: 32768,
      supportedModels: ['llama-3.1-8b-instant']
    };
  }

  estimateCost(): number {
    return 0;
  }

  getStatus(): ProviderStatus {
    return 'available';
  }
}

describe('TokenTrim Integration Tests', () => {
  let engine: TokenTrimEngine;

  beforeEach(() => {
    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: { neverSendSecrets: true, maskSecretsInLogs: true }
    };
    engine = new TokenTrimEngine(config);
  });

  it('Safe Result Mode accepts a shorter semantic-preserving output', async () => {
    const mockProvider = new MockProvider({
      text: 'We need to plan and take planning seriously, because the fundamentals of the history of this project show that the result and outcome will be a success.',
      inputTokens: 50,
      outputTokens: 25,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });
    (engine as any).groqProvider = mockProvider;

    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      safeResultMode: true
    };

    const result = await engine.compress(PROSE_INPUT, options);
    
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate).not.toBeNull();
    // Shorter output
    expect(result.finalTokens).toBeLessThan(result.originalTokens);
  });

  it('Force Target Mode always returns a shorter output', async () => {
    // Make AI provider fail completely to force the fallback cascade
    const mockProvider = new MockProvider({
      text: 'fail',
      inputTokens: 0,
      outputTokens: 0,
      model: 'fail',
      finishReason: 'stop'
    });
    (engine as any).groqProvider = mockProvider;
    (engine as any).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([]) // No AI candidates
    };

    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'extreme',
      safeResultMode: false
    };

    const result = await engine.compress(PROSE_INPUT, options);
    
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate).not.toBeNull();
    expect(result.finalTokens).toBeLessThan(result.originalTokens);
    expect(result.forcedTargetResult).toBe(true);
  });

  it('Balanced mode reports target met or closest available result, never "No candidates were generated."', async () => {
    // Generate an AI candidate that is out of range to trigger fallback message
    const mockProvider = new MockProvider({
      text: 'Plan ahead; project history indicates success. This is slightly longer.',
      inputTokens: 50,
      outputTokens: 20,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });
    (engine as any).groqProvider = mockProvider;

    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: false
    };

    const result = await engine.compress(PROSE_INPUT, options);
    
    expect(result.accepted).toBe(true);
    // Force-target mode may accept an out-of-range candidate as a fallback,
    // attaching an informational "Closest available result" note.
    if (result.rejectionReason) {
      expect(result.rejectionReason).toContain('Closest available result');
    }
    // Now verify the rejection reason logic for a failed force target is gone
    
    // Test the rejection reason for out of range safe fallback
    const outOfRangeOptions: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.9, // Impossible target
      minimumReductionRatio: 0.85,
      maximumReductionRatio: 0.95,
      safeResultMode: false
    };

    const outOfRangeResult = await engine.compress(PROSE_INPUT, outOfRangeOptions);
    expect(outOfRangeResult.accepted).toBe(true); // Should accept fallback
    expect(outOfRangeResult.rejectionReason).toContain('Closest available result');
    expect(outOfRangeResult.rejectionReason).not.toContain('No candidates were generated');
  });

  it('Secret input is still blocked', async () => {
    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      safeResultMode: false // Even in force mode
    };

    const secretInput = 'My AWS key is AKIA1234567890123456';
    
    await expect(engine.compress(secretInput, options)).rejects.toThrow('Secrets detected');
  });

  it('Safe Result regression: does not flag literal temporal word "before" as an instruction', async () => {
    const input = "The new deployment process has significantly reduced our release times. In other words, we're now able to ship code much faster than before. To put it another way, our releases are happening at a noticeably quicker pace than they used to. Basically, deployments are just faster now.";
    
    // Simulate AI doing a good paraphrase that drops the word "before"
    const mockProvider = new MockProvider({
      text: 'The new deployment process significantly reduced release times, enabling faster code delivery than previously.',
      inputTokens: 50,
      outputTokens: 25,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });
    (engine as any).groqProvider = mockProvider;

    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      safeResultMode: true
    };

    const result = await engine.compress(input, options);
    
    console.log('REJECTION REASON:', result.rejectionReason);
    console.log('FAILED CHECKS:', (result as any).verificationResult?.failedChecks);
    console.log('DETAILS:', (result as any).verificationResult?.details);

    expect(result.accepted).toBe(true);
    if (result.rejectionReason) {
      expect(result.rejectionReason).not.toContain('Lost instructions');
    }
    expect(result.bestCandidate).not.toBeNull();
    // Prove the word 'before' is gone from the output
    expect(result.bestCandidate!.compressedText.toLowerCase()).not.toContain('before');
    // Ensure no 'Lost instructions: before' failure occurred
    const verification = (engine as any).verifier.verify(input, result.bestCandidate!.compressedText, result.bestCandidate!.safetyScores, {});
    const syncVerif = await verification;
    expect(syncVerif.failedChecks).not.toContain('instruction_preservation');
  });

  it('Safe Result regression: compresses large structured spec without erroring "No compressible patterns found"', async () => {
    const markdownSpec = `
# Student Assistance System

## Requirements
*   Create a user login page
*   Create a password reset flow
*   Users must have strong passwords

## Database
*   User table
*   Session table
    `;
    
    // Test that the engine's tier0/AI can compress this without returning "No compressible patterns found"
    // even if AI provider is completely unavailable (forcing deterministic structured fallback)
    const mockProvider = new MockProvider({
      text: 'fail',
      inputTokens: 0,
      outputTokens: 0,
      model: 'fail',
      finishReason: 'stop'
    });
    (engine as any).groqProvider = mockProvider;
    (engine as any).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([]) 
    };

    const options: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      safeResultMode: true
    };

    const result = await engine.compress(markdownSpec, options);
    
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate).not.toBeNull();
    expect(result.rejectionReason).not.toContain('No compressible patterns found');
    expect(result.finalTokens).toBeLessThan(result.originalTokens);
    // Preserves the markdown structure
    expect(result.bestCandidate!.compressedText).toContain('## Database');
    expect(result.bestCandidate!.compressedText.toLowerCase()).toContain('strong password');
  });
});
