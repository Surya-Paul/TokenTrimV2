import { describe, it, expect } from 'vitest';
import { tokenizerRegistry } from '../index';
import { TiktokenTokenizer } from '../tiktoken-tokenizer';
import { GenericEstimator } from '../generic-estimator';

describe('TokenizerRegistry', () => {
  it('has tokenizers registered', () => {
    const models = tokenizerRegistry.getSupportedModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('gpt-4');
    expect(models).toContain('gpt-3.5-turbo');
  });

  it('returns correct tokenizer for GPT models', () => {
    const tokenizer = tokenizerRegistry.getTokenizer('gpt-4');
    expect(tokenizer).toBeInstanceOf(TiktokenTokenizer);
  });

  it('returns generic estimator for Claude models', () => {
    const tokenizer = tokenizerRegistry.getTokenizer('claude-3-opus');
    expect(tokenizer).toBeInstanceOf(GenericEstimator);
  });

  it('returns generic estimator for unknown models', () => {
    const tokenizer = tokenizerRegistry.getTokenizer('custom');
    expect(tokenizer).toBeInstanceOf(GenericEstimator);
  });
});

describe('TiktokenTokenizer', () => {
  let tokenizer: TiktokenTokenizer;

  beforeEach(() => {
    tokenizer = new TiktokenTokenizer();
  });

  it('counts tokens for GPT-4', async () => {
    const result = await tokenizer.countTokens('Hello, world!', 'gpt-4');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.estimationMethod).toBe('exact');
    expect(result.model).toBe('gpt-4');
  });

  it('counts tokens for GPT-3.5-turbo', async () => {
    const result = await tokenizer.countTokens('Hello, world!', 'gpt-3.5-turbo');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.estimationMethod).toBe('exact');
  });

  it('encodes and decodes correctly', async () => {
    const text = 'Hello, world!';
    const encoded = await tokenizer.encode(text, 'gpt-4');
    const decoded = await tokenizer.decode(encoded, 'gpt-4');
    expect(decoded).toBe(text);
  });

  it('handles longer text', async () => {
    const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10);
    const result = await tokenizer.countTokens(text, 'gpt-4');
    expect(result.tokens).toBeGreaterThan(50);
  });
});

describe('GenericEstimator', () => {
  let estimator: GenericEstimator;

  beforeEach(() => {
    estimator = new GenericEstimator();
  });

  it('estimates tokens for Claude', async () => {
    const result = await estimator.countTokens('Hello, world!', 'claude-3-opus');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.estimationMethod).toBe('approximate');
  });

  it('estimates tokens for Llama', async () => {
    const result = await estimator.countTokens('Hello, world!', 'llama-3-70b');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.estimationMethod).toBe('approximate');
  });

  it('handles longer text', async () => {
    const text = 'Lorem ipsum '.repeat(100);
    const result = await estimator.countTokens(text, 'custom');
    expect(result.tokens).toBeGreaterThan(0);
  });
});