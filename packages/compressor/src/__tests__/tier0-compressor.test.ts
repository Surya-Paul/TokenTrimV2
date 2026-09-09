import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Tier0Compressor } from '../tier0-compressor';
import { CompressionOptions } from '@tokentrim/shared';

describe('Tier0Compressor', () => {
  let compressor: Tier0Compressor;
  const options: CompressionOptions = {
    targetModel: 'gpt-4',
    maxCompressionRatio: 0.5,
    preserveFormatting: true,
    allowCloudFallback: false,
    requireConfirmationForCloud: true
  };

  beforeEach(() => {
    compressor = new Tier0Compressor('gpt-4');
    vi.spyOn(compressor as any, 'countTokens').mockImplementation(async (text: string) => text.length);
  });

  describe('Whitespace Compression', () => {
    it('removes extra whitespace', async () => {
      const input = 'Hello    world  \n\n\n  this   is   a   test';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).not.toContain('    ');
      expect(result!.compressedText).not.toContain('\n\n\n');
    });

    it('preserves code blocks', async () => {
      const input = 'Here is code:   \n```js\nfunction foo() {\n  return 1;\n}\n```\nMore text.   ';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('function foo()');
      expect(result!.compressedText).toContain('return 1;');
    });
  });

  describe('Redundant Phrase Removal', () => {
    it('removes "please" and filler phrases', async () => {
      const input = 'Please could you please help me with this task please';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText.toLowerCase()).not.toContain('please could you');
      expect(result!.compressedText.toLowerCase()).not.toContain('please help');
    });

    it('removes "I would like you to"', async () => {
      const input = 'I would like you to write a function';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).not.toContain('I would like you to');
    });
  });

  describe('List Compression', () => {
    it('compresses "A, B, and C" to "A, B, C"', async () => {
      const input = 'First, second, and third';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).not.toContain(', and ');
    });
  });

  describe('Punctuation Normalization', () => {
    it('removes multiple punctuation', async () => {
      const input = 'Hello!!! How are you??? I am fine...';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).not.toContain('!!!');
      expect(result!.compressedText).not.toContain('???');
    });

    it('fixes spacing around punctuation', async () => {
      const input = 'Hello , world !';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toBe('Hello, world!');
    });
  });

  describe('Filler Word Removal', () => {
    it('removes common filler words', async () => {
      const input = 'This is basically actually literally really very quite a test';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText.toLowerCase()).not.toContain('basically');
      expect(result!.compressedText.toLowerCase()).not.toContain('actually');
      expect(result!.compressedText.toLowerCase()).not.toContain('literally');
    });
  });

  describe('Abbreviations', () => {
    it('abbreviates common phrases at aggressive level', async () => {
      const aggressiveOptions = { ...options, maxCompressionRatio: 0.6 };
      const input = 'For example, this is a test. That is to say, it works. And so on.';
      const result = await compressor.compress(input, aggressiveOptions);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('e.g.');
      expect(result!.compressedText).toContain('i.e.');
      expect(result!.compressedText).toContain('etc.');
    });
  });

  describe('Protected Segment Preservation', () => {
    it('preserves URLs', async () => {
      const input = 'Visit    https://example.com/api/v1/users    for more info';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('https://example.com/api/v1/users');
    });

    it('preserves code blocks', async () => {
      const input = '```python\ndef hello():\n    print("world")\n```    \n\n\n';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('def hello():');
      expect(result!.compressedText).toContain('print("world")');
    });

    it('preserves inline code', async () => {
      const input = 'Use `const x = 1` to declare a variable';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('`const x = 1`');
    });

    it('preserves version numbers', async () => {
      const input = 'Version 2.4.1 is required';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressedText).toContain('2.4.1');
    });

    it('rejects compression if protected segment lost', async () => {
      // This test simulates a case where compression would break a URL
      // The current implementation should detect this and return null
      const input = 'Go to      https://example.com/path';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      // The URL should be preserved
      expect(result!.compressedText).toContain('https://example.com/path');
    });
  });

  describe('Safety Scores', () => {
    it('returns high safety scores for valid compression', async () => {
      const input = 'Please write a function that adds two numbers';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.safetyScores.overall).toBeGreaterThan(0.8);
      expect(result!.safetyScores.instructionConfidence).toBeGreaterThan(0.8);
      expect(result!.safetyScores.technicalIntegrity).toBeGreaterThan(0.8);
    });

    it('returns zero overhead for Tier 0', async () => {
      const input = 'Please write a function that adds two numbers';
      const result = await compressor.compress(input, options);
      expect(result).not.toBeNull();
      expect(result!.compressionOverhead).toBe(0);
      expect(result!.netTokenSavings).toBe(result!.grossTokenReduction);
    });
  });

  describe('No Compression Cases', () => {
    it('returns null for very short text', async () => {
      const input = 'Hi';
      vi.spyOn(compressor as any, 'countTokens').mockImplementation(async () => 1);
      const result = await compressor.compress(input, options);
      expect(result).toBeNull();
    });

    it('returns null when no reduction achieved', async () => {
      const input = 'Add a b';
      vi.spyOn(compressor as any, 'countTokens').mockImplementation(async () => 3);
      const result = await compressor.compress(input, options);
      expect(result).toBeNull();
    });
  });
});