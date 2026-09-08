import { Tokenizer, TokenCountResult, TargetModel } from '@tokentrim/shared';
import { encoding_for_model, Tiktoken, TiktokenModel } from 'tiktoken';

const TIKTOKEN_MODEL_MAP: Record<TargetModel, string> = {
  'gpt-4': 'gpt-4',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  'claude-3-opus': 'cl100k_base',
  'claude-3-sonnet': 'cl100k_base',
  'claude-3-haiku': 'cl100k_base',
  'claude-2': 'cl100k_base',
  'gemini-pro': 'cl100k_base',
  'gemini-1.5-pro': 'cl100k_base',
  'llama-3-70b': 'cl100k_base',
  'llama-3-8b': 'cl100k_base',
  'qwen-2.5-72b': 'cl100k_base',
  'phi-4-mini': 'cl100k_base',
  'custom': 'cl100k_base'
};

const SUPPORTED_MODELS: TargetModel[] = [
  'gpt-4',
  'gpt-4-turbo',
  'gpt-3.5-turbo'
];

export class TiktokenTokenizer implements Tokenizer {
  name = 'tiktoken';
  supportedModels = SUPPORTED_MODELS;
  private encoders: Map<string, Tiktoken> = new Map();

  private getEncoder(model: TargetModel): Tiktoken {
    const encodingName = TIKTOKEN_MODEL_MAP[model] || 'cl100k_base';
    if (!this.encoders.has(encodingName)) {
      try {
        this.encoders.set(encodingName, encoding_for_model(encodingName as TiktokenModel));
      } catch {
        this.encoders.set(encodingName, encoding_for_model('gpt-4' as TiktokenModel));
      }
    }
    return this.encoders.get(encodingName)!;
  }

  async countTokens(text: string, model: TargetModel): Promise<TokenCountResult> {
    const encoder = this.getEncoder(model);
    const tokens = encoder.encode(text);
    return {
      tokens: tokens.length,
      characters: text.length,
      model,
      estimationMethod: 'exact'
    };
  }

  async encode(text: string, model: TargetModel): Promise<number[]> {
    const encoder = this.getEncoder(model);
    return Array.from(encoder.encode(text));
  }

  async decode(tokens: number[], model: TargetModel): Promise<string> {
    const encoder = this.getEncoder(model);
    return new TextDecoder().decode(encoder.decode(new Uint32Array(tokens)));
  }
}