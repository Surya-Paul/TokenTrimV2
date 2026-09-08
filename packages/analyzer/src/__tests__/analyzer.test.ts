import { describe, it, expect, beforeEach } from 'vitest';
import { InputAnalyzer } from '../analyzer';
import { ContentType } from '@tokentrim/shared';

describe('InputAnalyzer', () => {
  let analyzer: InputAnalyzer;

  beforeEach(() => {
    analyzer = new InputAnalyzer('gpt-4');
  });

  describe('Content Type Detection', () => {
    it('detects code', async () => {
      const text = 'function foo() { return 1; }';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('code');
    });

    it('detects coding prompts', async () => {
      const text = 'Write a Python function to sort a list';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('coding_prompt');
    });

    it('detects SQL', async () => {
      const text = 'SELECT * FROM users WHERE id = 1';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('sql');
    });

    it('detects JSON', async () => {
      const text = '{"name": "John", "age": 30}';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('json');
    });

    it('detects Markdown', async () => {
      const text = '# Header\n\n- Item 1\n- Item 2';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('markdown');
    });

    it('detects logs', async () => {
      const text = '2024-01-15 10:30:00 ERROR Something went wrong';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('logs');
    });

    it('detects git diff', async () => {
      const text = 'diff --git a/file.txt b/file.txt\n@@ -1,3 +1,4 @@\n line 1\n+new line\n line 2';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('git_diff');
    });

    it('defaults to prose for plain text', async () => {
      const text = 'This is just a normal sentence.';
      const result = await analyzer.analyze(text);
      expect(result.contentType).toBe('prose');
    });
  });

  describe('Semantic Component Extraction', () => {
    it('extracts objectives', async () => {
      const text = 'Goal: Build a REST API for user management';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'objective')).toBe(true);
    });

    it('extracts instructions', async () => {
      const text = 'You must validate all inputs before processing';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'instruction')).toBe(true);
    });

    it('extracts constraints', async () => {
      const text = 'The function must return exactly 5 items';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'constraint')).toBe(true);
    });

    it('extracts prohibitions', async () => {
      const text = 'Do not use global variables';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'prohibition')).toBe(true);
    });

    it('extracts questions', async () => {
      const text = 'How do I implement authentication?';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'question')).toBe(true);
    });

    it('extracts output format', async () => {
      const text = 'Return the result as JSON';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'output_format')).toBe(true);
    });

    it('extracts examples', async () => {
      const text = 'For example, input [1,2,3] returns 6';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'example')).toBe(true);
    });

    it('extracts technical identifiers', async () => {
      const text = 'Call the processData() function';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'function_name')).toBe(true);
    });

    it('extracts URLs', async () => {
      const text = 'Visit https://example.com/api';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'url')).toBe(true);
    });

    it('extracts versions', async () => {
      const text = 'Use version 2.4.1';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'version')).toBe(true);
    });

    it('extracts file paths', async () => {
      const text = 'Edit ./src/index.ts';
      const result = await analyzer.analyze(text);
      expect(result.semanticComponents.some(c => c.type === 'file_path')).toBe(true);
    });
  });

  describe('Protected Segment Detection', () => {
    it('detects code blocks', async () => {
      const text = '```js\nconst x = 1;\n```';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'code_block')).toBe(true);
      expect(result.hasCodeBlocks).toBe(true);
    });

    it('detects inline code', async () => {
      const text = 'Use `const x = 1` here';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'inline_code')).toBe(true);
      expect(result.hasInlineCode).toBe(true);
    });

    it('detects URLs', async () => {
      const text = 'Go to https://example.com';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'url')).toBe(true);
      expect(result.hasUrls).toBe(true);
    });

    it('detects file paths', async () => {
      const text = 'Open /home/user/file.txt';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'file_path')).toBe(true);
    });

    it('detects explicit constraints', async () => {
      const text = 'You must exactly follow these rules';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'explicit_constraint')).toBe(true);
    });

    it('detects negative instructions', async () => {
      const text = 'Do not delete the file';
      const result = await analyzer.analyze(text);
      expect(result.protectedSegments.some(s => s.type === 'negative_instruction')).toBe(true);
    });
  });

  describe('Language Detection', () => {
    it('detects Python', async () => {
      const text = 'def foo():\n    return 1';
      const result = await analyzer.analyze(text);
      expect(result.language).toBe('python');
    });

    it('detects JavaScript', async () => {
      const text = 'const foo = () => 1;';
      const result = await analyzer.analyze(text);
      expect(result.language).toBe('javascript');
    });

    it('detects TypeScript', async () => {
      const text = 'interface Foo { bar: string }';
      const result = await analyzer.analyze(text);
      expect(result.language).toBe('typescript');
    });

    it('detects SQL', async () => {
      const text = 'SELECT * FROM users';
      const result = await analyzer.analyze(text);
      expect(result.language).toBe('sql');
    });
  });

  describe('Complexity Assessment', () => {
    it('rates simple text as low', async () => {
      const text = 'Hello world';
      const result = await analyzer.analyze(text);
      expect(result.complexity).toBe('low');
    });

    it('rates text with constraints as medium', async () => {
      const text = 'Return exactly 5 items in JSON format';
      const result = await analyzer.analyze(text);
      expect(result.complexity).toBe('medium');
    });

    it('rates complex prompts with code as high', async () => {
      const text = 'Write a Python function that must return exactly 3 items.\n```python\ndef foo():\n    return [1,2,3]\n```';
      const result = await analyzer.analyze(text);
      expect(result.complexity).toBe('high');
    });
  });

  describe('Structure Detection', () => {
    it('detects flat structure', async () => {
      const text = 'This is a simple paragraph.\nAnother paragraph.';
      const result = await analyzer.analyze(text);
      expect(result.structure).toBe('flat');
    });

    it('detects structured for JSON', async () => {
      const text = '{"key": "value"}';
      const result = await analyzer.analyze(text);
      expect(result.structure).toBe('structured');
    });

    it('detects nested for indented text', async () => {
      const text = '  item 1\n    subitem 1\n    subitem 2\n  item 2';
      const result = await analyzer.analyze(text);
      expect(result.structure).toBe('nested');
    });
  });
});