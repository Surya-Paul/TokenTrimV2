import {
  Tokenizer,
  TokenizerConfig,
  TokenCountResult,
  TargetModel,
  TargetModelSchema,
  ProviderType
} from '@tokentrim/shared';
import { TiktokenTokenizer } from './tiktoken-tokenizer';
import { GenericEstimator } from './generic-estimator';
import { ClaudeEstimator } from './claude-estimator';
import { LlamaTokenizer } from './llama-tokenizer';

export class TokenizerRegistry {
  private tokenizers: Map<string, Tokenizer> = new Map();
  private defaultTokenizer: Tokenizer;

  constructor() {
    // Register all tokenizers
    const tiktokenTokenizer = new TiktokenTokenizer();
    const genericEstimator = new GenericEstimator();
    const claudeEstimator = new ClaudeEstimator();
    const llamaTokenizer = new LlamaTokenizer();

    this.registerTokenizer(tiktokenTokenizer);
    this.registerTokenizer(genericEstimator);
    this.registerTokenizer(claudeEstimator);
    this.registerTokenizer(llamaTokenizer);

    // Default to generic estimator
    this.defaultTokenizer = genericEstimator;
  }

  registerTokenizer(tokenizer: Tokenizer): void {
    for (const model of tokenizer.supportedModels) {
      this.tokenizers.set(model, tokenizer);
    }
  }

  getTokenizer(model: TargetModel): Tokenizer {
    return this.tokenizers.get(model) || this.defaultTokenizer;
  }

  getTokenizerForConfig(config: TokenizerConfig): Tokenizer {
    return this.getTokenizer(config.model);
  }

  async countTokens(text: string, config: TokenizerConfig): Promise<TokenCountResult> {
    const tokenizer = this.getTokenizerForConfig(config);
    return tokenizer.countTokens(text, config.model);
  }

  async encode(text: string, config: TokenizerConfig): Promise<number[]> {
    const tokenizer = this.getTokenizerForConfig(config);
    return tokenizer.encode(text, config.model);
  }

  async decode(tokens: number[], config: TokenizerConfig): Promise<string> {
    const tokenizer = this.getTokenizerForConfig(config);
    return tokenizer.decode(tokens, config.model);
  }

  getSupportedModels(): TargetModel[] {
    return Array.from(this.tokenizers.keys()) as TargetModel[];
  }

  isModelSupported(model: TargetModel): boolean {
    return this.tokenizers.has(model);
  }
}

export const tokenizerRegistry = new TokenizerRegistry();

export function createTokenizerConfig(model: TargetModel, customTokenizer?: string): TokenizerConfig {
  return {
    model,
    customTokenizer,
    estimationOnly: !tokenizerRegistry.isModelSupported(model)
  };
}

// Re-export types
export type { TokenizerConfig, TokenCountResult, TargetModel, Tokenizer } from '@tokentrim/shared';