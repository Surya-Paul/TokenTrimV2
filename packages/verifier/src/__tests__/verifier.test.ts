import { describe, it, expect, beforeEach } from 'vitest';
import { VerificationEngine } from '../verifier';

describe('VerificationEngine', () => {
  let verifier: VerificationEngine;

  beforeEach(() => {
    verifier = new VerificationEngine({}, 'gpt-4');
  });

  describe('Instruction Preservation', () => {
    it('passes when instructions preserved', async () => {
      const original = 'You must write a function returning the sum of two numbers.';
      const compressed = 'You must write a function returning the sum of two numbers.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(true);
      expect(result.failedChecks).not.toContain('instruction_preservation');
    });

    it('fails when "must" is removed', async () => {
      const original = 'You must write a function that returns the sum.';
      const compressed = 'Write a function that returns the sum.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('instruction_preservation');
    });

    it('fails when "never" is removed', async () => {
      const original = 'Never use eval() in your code.';
      const compressed = 'Use eval() in your code.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('instruction_preservation');
    });

    it('fails when "do not" is changed to "do"', async () => {
      const original = 'Do not modify the authentication logic.';
      const compressed = 'Modify the authentication logic.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('instruction_preservation');
    });
  });

  describe('Constraint Preservation', () => {
    it('passes when exact count preserved', async () => {
      const original = 'Return exactly 3 examples.';
      const compressed = 'Return exactly 3 examples.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(true);
    });

    it('fails when exact count changed', async () => {
      const original = 'Return exactly 3 examples.';
      const compressed = 'Return some examples.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('constraint_preservation');
    });

    it('fails when format constraint lost', async () => {
      const original = 'Output in JSON format.';
      const compressed = 'Output the result.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('constraint_preservation');
    });

    it('fails when language constraint lost', async () => {
      const original = 'Write the solution in Python.';
      const compressed = 'Write the solution.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('constraint_preservation');
    });
  });

  describe('Technical Integrity', () => {
    it('passes when code blocks preserved', async () => {
      const original = '```js\nfunction foo() { return 1; }\n```';
      const compressed = '```js\nfunction foo() { return 1; }\n```';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(true);
    });

    it('fails when code block modified', async () => {
      const original = '```js\nfunction foo() { return 1; }\n```';
      const compressed = '```js\nfunction foo() { return 2; }\n```';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('technical_integrity');
    });

    it('fails when URL modified', async () => {
      const original = 'Visit https://api.example.com/v1/users';
      const compressed = 'Visit https://api.example.com/v2/users';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('technical_integrity');
    });

    it('fails when function name changed', async () => {
      const original = 'Call the processData() function';
      const compressed = 'Call the process() function';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('technical_integrity');
    });

    it('passes when version numbers preserved', async () => {
      const original = 'Use version 2.4.1 of the library';
      const compressed = 'Use version 2.4.1 of the library';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('Semantic Similarity', () => {
    it('passes for semantically similar text', async () => {
      const original = 'The primary goal is to optimize the database queries for better performance.';
      const compressed = 'Main goal: optimize database queries for better performance.';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(true);
    });

    it('fails for completely different meaning', async () => {
      const original = 'Write a function to calculate the factorial';
      const compressed = 'Delete all files from the system';
      
      const result = await verifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('semantic_similarity');
    });
  });

  describe('Threshold Configuration', () => {
    it('uses custom thresholds', async () => {
      const strictVerifier = new VerificationEngine({
        instructionConfidence: 1.0,
        technicalIntegrity: 1.0,
        semanticConfidence: 1.0,
        overall: 1.0
      }, 'gpt-4');

      const original = 'You must write a function';
      const compressed = 'Write a function'; // missing "must"
      
      const result = await strictVerifier.verify(original, compressed, {
        semanticConfidence: 0.9,
        instructionConfidence: 0.9,
        technicalIntegrity: 0.9,
        privacyConfidence: 1.0,
        compressionConfidence: 0.9,
        overall: 0.9
      });

      // With 1.0 threshold, even 0.9 should fail
      expect(result.passed).toBe(false);
    });
  });
});