import { Tokenizer, TokenCountResult, TargetModel } from '@tokentrim/shared';

const SUPPORTED_MODELS: TargetModel[] = [
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-2',
  'gemini-pro',
  'gemini-1.5-pro',
  'llama-3-70b',
  'llama-3-8b',
  'qwen-2.5-72b',
  'phi-4-mini',
  'custom'
];

const CHARS_PER_TOKEN_ESTIMATES: Record<TargetModel, number> = {
  'gpt-4': 4.0,
  'gpt-4-turbo': 4.0,
  'gpt-3.5-turbo': 4.0,
  'claude-3-opus': 3.5,
  'claude-3-sonnet': 3.5,
  'claude-3-haiku': 3.5,
  'claude-2': 3.5,
  'gemini-pro': 4.0,
  'gemini-1.5-pro': 4.0,
  'llama-3-70b': 3.8,
  'llama-3-8b': 3.8,
  'qwen-2.5-72b': 3.8,
  'phi-4-mini': 4.0,
  'custom': 4.0
};

export class GenericEstimator implements Tokenizer {
  name = 'generic-estimator';
  supportedModels = SUPPORTED_MODELS;

  async countTokens(text: string, model: TargetModel): Promise<TokenCountResult> {
    const charsPerToken = CHARS_PER_TOKEN_ESTIMATES[model] || 4.0;
    const estimatedTokens = Math.ceil(text.length / charsPerToken);
    return {
      tokens: estimatedTokens,
      characters: text.length,
      model,
      estimationMethod: 'approximate'
    };
  }

  async encode(text: string, model: TargetModel): Promise<number[]> {
    const charsPerToken = CHARS_PER_TOKEN_ESTIMATES[model] || 4.0;
    const estimatedLength = Math.ceil(text.length / charsPerToken);
    return Array.from({ length: estimatedLength }, (_, i) => i);
  }

  async decode(tokens: number[], model: TargetModel): Promise<string> {
    const charsPerToken = CHARS_PER_TOKEN_ESTIMATES[model] || 4.0;
    const estimatedChars = tokens.length * charsPerToken;
    return 'x'.repeat(Math.round(estimatedChars));
  }
}