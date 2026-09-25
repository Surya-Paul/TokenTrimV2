import { describe, it, expect } from 'vitest';
import { TokenTrimEngine } from '../engine';
import { LLMProvider, GenerateOptions, GenerateResponse, ProviderHealth } from '@tokentrim/providers';

// Exactly 77 tokens input
const PROMPT = "I reviewed the changes the intern made to the API documentation that were flagged by the reviewer using the new linting tool, and just to be clear, due to the fact that I wasn't totally sure if the tool was checking the documentation or the actual code, I wanted to double check with you, if that's not too much trouble, whether we should re-run it on both.";

const PROMPT_WORDS = PROMPT.split(' ');

// A mock provider that returns a dummy response with the exact token count requested in the prompt
// (since the prompt includes `targetOutputTokens`, we can parse it from the prompt)
class MockProvider implements LLMProvider {
  type: any = 'groq';
  async generate(prompt: string, options: GenerateOptions): Promise<GenerateResponse> { 
    // Handle verification requests (they ask for JSON)
    if (prompt.includes('{') && prompt.includes('semanticConfidence')) {
      return {
        text: '{"semanticConfidence":0.9,"instructionConfidence":0.9,"technicalIntegrity":0.9,"privacyConfidence":1.0,"compressionConfidence":0.9}',
        inputTokens: 100,
        outputTokens: 50,
        model: 'llama-3.1-8b-instant',
        finishReason: 'stop'
      };
    }

    // Extract "Target output: ~X tokens." or "aim for roughly X output tokens."
    let target = 28; // Default
    const forceMatch = prompt.match(/Target output: ~(\d+) tokens/);
    const safeMatch = prompt.match(/aim for roughly (\d+) output tokens/);
    if (forceMatch) target = parseInt(forceMatch[1]);
    else if (safeMatch) target = parseInt(safeMatch[1]);

    // Use exact number of tokens by repeating 'a' since safeResultMode=false bypasses semantic checks
    const dummyText = Array(target).fill('a').join(' ');

    return {
      text: dummyText,
      inputTokens: 77,
      outputTokens: target,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    };
  }
  async healthCheck(): Promise<ProviderHealth> { return { healthy: true, modelAvailable: true }; }
  getModel(): string { return 'llama-3.1-8b-instant'; }
  updateConfig(config: any): void {}
}

function createEngine() {
  const engine = new TokenTrimEngine({
    targetModel: 'gpt-4',
    groqConfig: { apiKey: 'mock', model: 'llama-3.1-8b-instant', timeoutMs: 5000, maxRetries: 1, retryDelayMs: 100 }
  });
  (engine as any).groqProvider = new MockProvider();
  return engine;
}

describe('TokenTrim Target Budget Selection', () => {
  it('Aggressive output token count is between 35 and 42 tokens (45-55% reduction)', async () => {
    const engine = createEngine();
    const result = await engine.compress(PROMPT, {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      safeResultMode: false
    });

    // 77 tokens. 50% target = 38.5 tokens. Range = 45%-55% (34.65 - 42.35 tokens).
    const reductionPct = (result.grossReduction / result.originalTokens) * 100;
    const finalTokens = result.originalTokens - result.grossReduction;

    expect(finalTokens).toBeGreaterThanOrEqual(35);
    expect(finalTokens).toBeLessThanOrEqual(42);
    expect(reductionPct).toBeGreaterThanOrEqual(45);
    expect(reductionPct).toBeLessThanOrEqual(55);
  });

  it('Candidate selection test: chooses nearest target budget candidate over shortest', async () => {
    const engine = createEngine();
    // Inject a special mock that returns a 28-token and a 39-token candidate
    class SpecialMockProvider implements LLMProvider {
      type: any = 'groq';
      private callCount = 0;
      async generate(prompt: string, options: GenerateOptions): Promise<GenerateResponse> { 
        if (prompt.includes('{') && prompt.includes('semanticConfidence')) {
          return {
            text: '{"semanticConfidence":0.9,"instructionConfidence":0.9,"technicalIntegrity":0.9,"privacyConfidence":1.0,"compressionConfidence":0.9}',
            inputTokens: 100,
            outputTokens: 50,
            model: 'llama-3.1-8b-instant',
            finishReason: 'stop'
          };
        }
        
        this.callCount++;
        // Return 28 token on first call (63.6%), 39 token on second call (50%)
        const target = this.callCount === 1 ? 28 : 39;
        return {
          text: Array(target).fill('a').join(' '),
          inputTokens: 77,
          outputTokens: target,
          model: 'llama-3.1-8b-instant',
          finishReason: 'stop'
        };
      }
      async healthCheck(): Promise<ProviderHealth> { return { healthy: true, modelAvailable: true }; }
      getModel(): string { return 'llama-3.1-8b-instant'; }
      updateConfig(config: any): void {}
    }
    (engine as any).groqProvider = new SpecialMockProvider();

    const result = await engine.compress(PROMPT, {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      safeResultMode: false
    });
    
    // Aggressive target is 50%. 39 tokens is 49% reduction. 28 tokens is 63.6% reduction.
    // The 39 token candidate should win, even though 28 is shorter.
    const finalTokens = result.originalTokens - result.grossReduction;
    expect(finalTokens).toBe(39);
  });

  it('Balanced mode selects 30-40% reduction', async () => {
    const engine = createEngine();
    const result = await engine.compress(PROMPT, {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      safeResultMode: false
    });
    const reductionPct = (result.grossReduction / result.originalTokens) * 100;
    expect(reductionPct).toBeGreaterThanOrEqual(30);
    expect(reductionPct).toBeLessThanOrEqual(40);
  });

  it('Conservative mode selects 17-23% reduction', async () => {
    const engine = createEngine();
    const result = await engine.compress(PROMPT, {
      targetModel: 'gpt-4',
      compressionTarget: 'conservative',
      safeResultMode: false
    });
    const reductionPct = (result.grossReduction / result.originalTokens) * 100;
    expect(reductionPct).toBeGreaterThanOrEqual(17);
    expect(reductionPct).toBeLessThanOrEqual(23);
  });

  it('Extreme mode selects 68-80% reduction', async () => {
    const engine = createEngine();
    const result = await engine.compress(PROMPT, {
      targetModel: 'gpt-4',
      compressionTarget: 'extreme',
      safeResultMode: false
    });
    const reductionPct = (result.grossReduction / result.originalTokens) * 100;
    expect(reductionPct).toBeGreaterThanOrEqual(68);
    expect(reductionPct).toBeLessThanOrEqual(80);
  });
});
