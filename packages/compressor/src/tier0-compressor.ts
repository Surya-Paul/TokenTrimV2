import {
  CompressionCandidate,
  CompressionTier,
  ProviderType,
  SafetyScores,
  AnalysisResult,
  ProtectedSegment,
  TargetModel,
  CompressionOptions
} from '@tokentrim/shared';
import { InputAnalyzer } from '@tokentrim/analyzer';
import { tokenizerRegistry } from '@tokentrim/tokenizer';

export class Tier0Compressor {
  private analyzer: InputAnalyzer;

  constructor(targetModel: TargetModel = 'gpt-4') {
    this.analyzer = new InputAnalyzer(targetModel);
  }

  async compress(text: string, options: CompressionOptions): Promise<CompressionCandidate | null> {
    const analysis = await this.analyzer.analyze(text);
    const originalTokens = await this.countTokens(text, options.targetModel);
    
    let compressed = text;
    
    // Create placeholders for protected segments
    const { placeholderized, placeholders } = this.applyPlaceholders(compressed, analysis.protectedSegments);
    compressed = placeholderized;

    // Add structured-specification compression
    if (analysis.contentType === 'coding_prompt' || analysis.contentType === 'markdown') {
        compressed = this.compressStructuredSpec(compressed);
    }
    
    // Apply Tier 0 compression rules in order of safety
    compressed = this.removeExtraWhitespace(compressed, analysis);
    compressed = this.removeRedundantPhrases(compressed, analysis);
    compressed = this.compressLists(compressed, analysis);
    compressed = this.normalizePunctuation(compressed, analysis);
    compressed = this.removeFillerWords(compressed, analysis);
    
    // Only apply aggressive rules if target allows
    if (options.maxCompressionRatio && options.maxCompressionRatio > 0.3) {
      compressed = this.abbreviateCommonTerms(compressed, analysis);
      compressed = this.compressExamples(compressed, analysis);
    }
    
    // Restore placeholders exactly
    compressed = this.restorePlaceholders(compressed, placeholders);
    
    // Ensure protected segments are intact (safety check)
    compressed = this.restoreProtectedSegments(text, compressed, analysis.protectedSegments);
    
    const compressedTokens = await this.countTokens(compressed, options.targetModel);
    const grossReduction = originalTokens - compressedTokens;
    const reductionRatio = grossReduction / originalTokens;
    
    // Only accept if there's actual reduction
    if (compressedTokens >= originalTokens || reductionRatio < 0.02) {
      return null;
    }
    
    const safetyScores = this.calculateSafetyScores(text, compressed, analysis);
    
    return {
      id: `tier0-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      originalText: text,
      compressedText: compressed,
      tier: 'tier0',
      provider: 'deterministic',
      grossTokenReduction: grossReduction,
      compressionOverhead: 0,
      netTokenSavings: grossReduction,
      safetyScores,
      timestamp: Date.now(),
      metadata: {
        analysis,
        reductionRatio,
        rulesApplied: this.getAppliedRules(text, compressed)
      }
    };
  }

  private applyPlaceholders(text: string, segments: ProtectedSegment[]): { placeholderized: string, placeholders: Record<string, string> } {
    const placeholders: Record<string, string> = {};
    let out = "";
    let lastIndex = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) continue;
        if (seg.startIndex >= lastIndex) {
            out += text.slice(lastIndex, seg.startIndex);
            const placeholder = `__PROTECTED_SEGMENT_${i}__`;
            out += placeholder;
            placeholders[placeholder] = seg.content;
            lastIndex = seg.endIndex;
        }
    }
    out += text.slice(lastIndex);
    return { placeholderized: out, placeholders };
  }

  private restorePlaceholders(text: string, placeholders: Record<string, string>): string {
    let result = text;
    for (const [placeholder, content] of Object.entries(placeholders)) {
        // Use split/join to replace all occurrences without regex special character issues
        result = result.split(placeholder).join(content);
    }
    return result;
  }

  private compressStructuredSpec(text: string): string {
    let result = text;
    
    // Remove blank-line excess
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // Compact verbose headings
    result = result.replace(/^(#{1,6})\s+(?:The|A|An)\s+(.+)$/gm, '$1 $2');
    result = result.replace(/^(#{1,6})\s+Detailed\s+(?:Requirements|Specifications)\s+for\s+(.+)$/gm, '$1 $2 Requirements');
    
    // Convert repeated "Create/Implement/Build" wording into concise list items
    result = result.replace(/^(\s*[-*+]\s+)(?:Create|Implement|Build|Develop|Design|Add)\s+(?:a|an|the\s+)?(.+)$/gmi, '$1$2');
    
    // Compact nested lists (just remove extra blank lines between list items)
    result = result.replace(/^(\s*[-*+]\s+.+)\n\n+(?=\s*[-*+]\s+)/gm, '$1\n');
    
    // Merge duplicate or overlapping requirements in lists
    const lines = result.split('\n');
    const seenLists = new Set<string>();
    const outLines = [];
    for (const line of lines) {
        if (/^\s*[-*+]\s+/.test(line)) {
            const normalized = line.trim().toLowerCase();
            if (!seenLists.has(normalized)) {
                seenLists.add(normalized);
                outLines.push(line);
            }
        } else {
            outLines.push(line);
            seenLists.clear(); // Reset on non-list
        }
    }
    result = outLines.join('\n');
    
    return result;
  }

  private removeExtraWhitespace(text: string, analysis: AnalysisResult): string {
    // Preserve code blocks and pre-formatted content
    const codeBlocks: string[] = [];
    let processed = text.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    // Normalize whitespace
    processed = processed
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[ \t]+|[ \t]+$/gm, '')
      .trim();
    
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      processed = processed.replace(`__CODE_BLOCK_${i}__`, block);
    });
    
    return processed;
  }

  private removeRedundantPhrases(text: string, analysis: AnalysisResult): string {
    const redundantPatterns = [
      // Filler phrases that don't add meaning
      /\b(?:please\s+)?(?:could you|would you|can you)\s+(?:please\s+)?/gi,
      /\b(?:i would like you to|i want you to|i need you to)\s+/gi,
      /\b(?:it would be great if|it would be helpful if|it would be appreciated if)\s+/gi,
      /\b(?:kindly|please)\s+(?:note that|be aware that|remember that)\s+/gi,
      /\b(?:in order to|so as to)\s+/gi,
      /\b(?:the fact that|the reason why|the way in which)\s+/gi,
      /\b(?:at this point in time|at the present time|currently|right now)\s+/gi,
      /\b(?:due to the fact that|because of the fact that)\s+/gi,
      /\b(?:in the event that|in case|should it happen that)\s+/gi,
      /\b(?:it is important to note that|it should be noted that|note that)\s+/gi,
      /\b(?:as a matter of fact|in fact|actually|basically|essentially)\s+/gi
    ];

    let result = text;
    for (const pattern of redundantPatterns) {
      result = result.replace(pattern, '');
    }
    
    return result;
  }

  private compressLists(text: string, analysis: AnalysisResult): string {
    // Convert verbose lists to compact form
    let result = text;
    
    // "A, B, C, and D" -> "A, B, C, D"
    result = result.replace(/\b(\w+(?:\s+\w+)?),\s+(\w+(?:\s+\w+)?),\s+and\s+(\w+(?:\s+\w+)?)\b/g, '$1, $2, $3');
    
    // "First, ... Second, ... Third, ..." -> "1. ... 2. ... 3. ..."
    result = result.replace(/\b(?:First|Second|Third|Fourth|Fifth|Finally|Lastly)[,:]\s*/gi, (m) => {
      const word = m.split(/[,:\s]/)[0];
      const num = word ? ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Finally', 'Lastly'].indexOf(word) + 1 : 1;
      return `${num}. `;
    });
    
    return result;
  }

  private normalizePunctuation(text: string, analysis: AnalysisResult): string {
    let result = text;
    
    // Multiple punctuation -> single
    result = result.replace(/([.!?])\1+/g, '$1');
    result = result.replace(/\s+([.!?,:;])/g, '$1');
    result = result.replace(/([.!?])(?=[A-Z])/g, '$1 ');
    
    // Remove trailing spaces before newlines
    result = result.replace(/\s+\n/g, '\n');
    
    return result;
  }

  private removeFillerWords(text: string, analysis: AnalysisResult): string {
    const fillerWords = [
      'basically', 'actually', 'literally', 'really', 'very', 'quite',
      'rather', 'somewhat', 'kind of', 'sort of', 'pretty much',
      'in general', 'generally speaking', 'for the most part',
      'more or less', 'almost', 'nearly', 'practically'
    ];
    
    let result = text;
    for (const word of fillerWords) {
      const regex = new RegExp(`\\b${word}\\b\\s*`, 'gi');
      result = result.replace(regex, '');
    }
    
    return result;
  }

  private abbreviateCommonTerms(text: string, analysis: AnalysisResult): string {
    const abbreviations: Record<string, string> = {
      'for example': 'e.g.',
      'that is': 'i.e.',
      'and so on': 'etc.',
      'versus': 'vs.',
      'approximately': '~',
      'number': 'no.',
      'version': 'v.',
      'maximum': 'max',
      'minimum': 'min',
      'application': 'app',
      'environment': 'env',
      'production': 'prod',
      'development': 'dev',
      'testing': 'test',
      'database': 'db',
      'repository': 'repo',
      'documentation': 'docs',
      'specification': 'spec',
      'initialization': 'init',
      'configuration': 'cfg',
      'argument': 'arg',
      'parameter': 'param',
      'variable': 'var',
      'function': 'fn',
      'method': 'mtd',
      'class': 'cls',
      'interface': 'iface',
      'implementation': 'impl',
      'standard': 'std',
      'error': 'err',
      'message': 'msg',
      'request': 'req',
      'response': 'res',
      'status': 'stat',
      'temporary': 'tmp',
      'utilities': 'utils',
      'components': 'comps',
      'properties': 'props',
      'attributes': 'attrs',
      'elements': 'els',
      'nodes': 'nds',
      'references': 'refs',
      'identifiers': 'ids',
      'indexes': 'idxs',
      'values': 'vals',
      'results': 'res',
      'options': 'opts',
      'parameters': 'params',
      'arguments': 'args',
      'variables': 'vars',
      'functions': 'fns',
      'methods': 'mtds',
      'classes': 'clss',
      'interfaces': 'ifaces'
    };

    // Protect code blocks from abbreviation (same guard as removeExtraWhitespace)
    const codeBlocks: string[] = [];
    let result = text.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // Also protect inline code
    const inlineCodes: string[] = [];
    result = result.replace(/`[^`]+`/g, (match) => {
      inlineCodes.push(match);
      return `__INLINE_CODE_${inlineCodes.length - 1}__`;
    });

    for (const [full, abbr] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${full}\\b`, 'gi');
      result = result.replace(regex, abbr);
    }

    // Restore inline code then code blocks
    inlineCodes.forEach((code, i) => {
      result = result.replace(`__INLINE_CODE_${i}__`, code);
    });
    codeBlocks.forEach((block, i) => {
      result = result.replace(`__CODE_BLOCK_${i}__`, block);
    });

    return result;
  }

  private compressExamples(text: string, analysis: AnalysisResult): string {
    // Compress verbose examples
    let result = text;
    
    // "For example, X. For instance, Y." -> "E.g., X; Y."
    result = result.replace(/(?:for example|for instance)[,:]\s*([^.]+)\.\s*(?:for example|for instance)[,:]\s*([^.]+)\./gi, 'E.g., $1; $2.');
    
    // Remove "Example:" prefix if followed by code
    result = result.replace(/example\s*[:-]\s*(```)/gi, '$1');
    
    return result;
  }

  private restoreProtectedSegments(original: string, compressed: string, protectedSegments: ProtectedSegment[]): string {
    // For Tier 0, we ensure protected segments from original are in compressed
    // This is a safety check - if segments were lost, we reject the compression
    for (const segment of protectedSegments) {
      // For keyword-type segments, just check the keyword is present
      if (['explicit_constraint', 'negative_instruction'].includes(segment.type)) {
        const keyword = segment.content.trim().split(/\s+/)[0]; // Get the core keyword
        if (keyword && !compressed.toLowerCase().includes(keyword.toLowerCase())) {
          return original;
        }
        continue;
      }
      // For structural segments (code, URLs, etc.), require exact match
      if (!compressed.includes(segment.content)) {
        return original;
      }
    }
    return compressed;
  }

  private calculateSafetyScores(original: string, compressed: string, analysis: AnalysisResult): SafetyScores {
    // Tier 0 is deterministic and safe by design
    // But we still verify key properties
    
    const semanticConfidence = this.checkSemanticPreservation(original, compressed, analysis);
    const instructionConfidence = this.checkInstructionPreservation(original, compressed, analysis);
    const technicalIntegrity = this.checkTechnicalIntegrity(original, compressed, analysis);
    const privacyConfidence = 1.0; // Tier 0 never sends data anywhere
    const compressionConfidence = 0.9; // High confidence in deterministic rules
    
    const overall = (
      semanticConfidence * 0.25 +
      instructionConfidence * 0.25 +
      technicalIntegrity * 0.2 +
      privacyConfidence * 0.15 +
      compressionConfidence * 0.15
    );

    return {
      semanticConfidence,
      instructionConfidence,
      technicalIntegrity,
      privacyConfidence,
      compressionConfidence,
      overall
    };
  }

  private checkSemanticPreservation(original: string, compressed: string, analysis: AnalysisResult): number {
    // Check that key semantic components are preserved using fuzzy key-term matching
    let preserved = 0;
    let total = 0;

    for (const component of analysis.semanticComponents) {
      if (component.type === 'objective' || component.type === 'instruction' ||
          component.type === 'constraint' || component.type === 'prohibition') {
        total++;
        const normalized = component.content.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const compNormalized = compressed.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const keyTerms = normalized.split(/\s+/).filter((t: string) => t.length > 3);
        if (keyTerms.length === 0) {
          preserved++;
        } else {
          const compTerms = new Set(compNormalized.split(/\s+/));
          const matches = keyTerms.filter((term: string) => compTerms.has(term) || compNormalized.includes(term)).length;
          if (matches / keyTerms.length >= 0.5) { // Lowered from 0.6 to 0.5
            preserved++;
          }
        }
      }
    }

    return total > 0 ? preserved / total : 1.0;
  }

  private checkInstructionPreservation(original: string, compressed: string, analysis: AnalysisResult): number {
    // Check that explicit instructions are preserved
    const instructionWords = ['must', 'should', 'required', 'exactly', 'only', 'never', 'don\'t', 'do not', 'without', 'unless'];
    let preserved = 0;
    let total = 0;
    
    for (const word of instructionWords) {
      const originalCount = (original.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      const compressedCount = (compressed.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      
      if (originalCount > 0) {
        total += originalCount;
        preserved += Math.min(originalCount, compressedCount);
      }
    }
    
    return total > 0 ? preserved / total : 1.0;
  }

  private checkTechnicalIntegrity(original: string, compressed: string, analysis: AnalysisResult): number {
    // Check that technical content is preserved
    let preserved = 0;
    let total = 0;
    
    for (const segment of analysis.protectedSegments) {
      if (['code_block', 'inline_code', 'url', 'file_path', 'api_endpoint', 'function_name', 'class_name', 'variable_name'].includes(segment.type)) {
        total++;
        if (compressed.includes(segment.content)) {
          preserved++;
        }
      }
    }
    
    return total > 0 ? preserved / total : 1.0;
  }

  private getAppliedRules(original: string, compressed: string): string[] {
    const rules: string[] = [];
    if (original !== compressed) {
      if (/\s{2,}/.test(original) && !/\s{2,}/.test(compressed)) rules.push('whitespace');
      if (/(?:please|kindly)/i.test(original) && !/(?:please|kindly)/i.test(compressed)) rules.push('redundant_phrases');
      if (/(?:for example|that is|and so on)/i.test(original) && !/(?:for example|that is|and so on)/i.test(compressed)) rules.push('abbreviations');
      if (/(?:basically|actually|literally)/i.test(original) && !/(?:basically|actually|literally)/i.test(compressed)) rules.push('filler_words');
    }
    return rules;
  }

  private async countTokens(text: string, model: TargetModel): Promise<number> {
    const result = await tokenizerRegistry.countTokens(text, { model });
    return result.tokens;
  }
}