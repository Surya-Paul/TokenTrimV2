import { Tokenizer, TokenCountResult, TargetModel } from '@tokentrim/shared';

const LLAMA_MODELS: TargetModel[] = [
  'llama-3-70b',
  'llama-3-8b',
  'qwen-2.5-72b',
  'phi-4-mini'
];

const LLAMA_CHARS_PER_TOKEN: Partial<Record<TargetModel, number>> = {
  'llama-3-70b': 3.7,
  'llama-3-8b': 3.7,
  'qwen-2.5-72b': 3.7,
  'phi-4-mini': 3.8
};

export class LlamaTokenizer implements Tokenizer {
  name = 'llama-tokenizer';
  supportedModels = LLAMA_MODELS;

  async countTokens(text: string, model: TargetModel): Promise<TokenCountResult> {
    const charsPerToken = LLAMA_CHARS_PER_TOKEN[model] || 3.8;
    const estimatedTokens = Math.ceil(text.length / charsPerToken);
    return {
      tokens: estimatedTokens,
      characters: text.length,
      model,
      estimationMethod: 'approximate'
    };
  }

  async encode(text: string, model: TargetModel): Promise<number[]> {
    const charsPerToken = LLAMA_CHARS_PER_TOKEN[model] || 3.8;
    const estimatedLength = Math.ceil(text.length / charsPerToken);
    return Array.from({ length: estimatedLength }, (_, i) => i);
  }

  async decode(tokens: number[], model: TargetModel): Promise<string> {
    const charsPerToken = LLAMA_CHARS_PER_TOKEN[model] || 3.8;
    const estimatedChars = tokens.length * charsPerToken;
    return 'x'.repeat(Math.round(estimatedChars));
  }
}