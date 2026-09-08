import { Tokenizer, TokenCountResult, TargetModel } from '@tokentrim/shared';

const CLAUDE_MODELS: TargetModel[] = [
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-2'
];

const CLAUDE_CHARS_PER_TOKEN: Partial<Record<TargetModel, number>> = {
  'claude-3-opus': 3.4,
  'claude-3-sonnet': 3.4,
  'claude-3-haiku': 3.4,
  'claude-2': 3.4
};

export class ClaudeEstimator implements Tokenizer {
  name = 'claude-estimator';
  supportedModels = CLAUDE_MODELS;

  async countTokens(text: string, model: TargetModel): Promise<TokenCountResult> {
    const charsPerToken = CLAUDE_CHARS_PER_TOKEN[model] || 3.5;
    const estimatedTokens = Math.ceil(text.length / charsPerToken);
    return {
      tokens: estimatedTokens,
      characters: text.length,
      model,
      estimationMethod: 'approximate'
    };
  }

  async encode(text: string, model: TargetModel): Promise<number[]> {
    const charsPerToken = CLAUDE_CHARS_PER_TOKEN[model] || 3.5;
    const estimatedLength = Math.ceil(text.length / charsPerToken);
    return Array.from({ length: estimatedLength }, (_, i) => i);
  }

  async decode(tokens: number[], model: TargetModel): Promise<string> {
    const charsPerToken = CLAUDE_CHARS_PER_TOKEN[model] || 3.5;
    const estimatedChars = tokens.length * charsPerToken;
    return 'x'.repeat(Math.round(estimatedChars));
  }
}