import { InputAnalyzer } from '../analyzer';
import { it, describe } from 'vitest';

describe('Debug Analyzer', () => {
  it('analyzes text', async () => {
    const analyzer = new InputAnalyzer();
    const text = "I reviewed the changes the intern made to the API documentation that were flagged by the reviewer using the new linting tool, and just to be clear, due to the fact that I wasn't totally sure if the tool was checking the documentation or the actual code, I wanted to double check with you, if that's not too much trouble, whether we should re-run it on both.";
    const result = await analyzer.analyze(text);
    console.log("Protected Segments:", JSON.stringify(result.protectedSegments, null, 2));
    console.log("Semantic Components:", JSON.stringify(result.semanticComponents, null, 2));
  });
});
