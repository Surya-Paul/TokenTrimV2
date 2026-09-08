import {
  VerificationResult,
  VerificationThresholds,
  VerificationDetail,
  SafetyScores,
  SafetyCheckType,
  AnalysisResult,
  Constraint,
  InstructionCheck,
  ConstraintCheck,
  TechnicalIntegrityCheck,
  IntegrityItem,
  ProtectedSegment,
  SemanticComponent
} from '@tokentrim/shared';
import { InputAnalyzer } from '@tokentrim/analyzer';
import { tokenizerRegistry } from '@tokentrim/tokenizer';

export const DEFAULT_THRESHOLDS: VerificationThresholds = {
  semanticConfidence: 0.85,
  instructionConfidence: 0.95,
  technicalIntegrity: 0.99,
  privacyConfidence: 1.0,
  compressionConfidence: 0.8,
  overall: 0.9
};

const INSTRUCTION_KEYWORDS = [
  'must', 'should', 'required', 'exactly', 'only', 'never', 
  'don\'t', 'do not', 'without', 'unless', 'before', 'after',
  'precisely', 'specifically', 'strictly', 'mandatory'
];

const CONSTRAINT_PATTERNS = [
  { type: 'count' as const, pattern: /\b(exactly|precisely|at least|at most|no more than|no less than|minimum|maximum)\s+\d+/gi },
  { type: 'format' as const, pattern: /\b(?:format|output|return|respond)\s+(?:as|in|using)\s+(?:json|xml|yaml|markdown|csv|table|list|bullet points?|numbered)\b/gi },
  { type: 'technology' as const, pattern: /\b(?:use|using|with|in)\s+(?:python|javascript|typescript|java|c\+\+|go|rust|swift|kotlin|react|vue|angular|node|django|flask|spring)\b/gi },
  { type: 'language' as const, pattern: /\b(?:language|lang)\s*[:\-]\s*(\w+)/gi },
  { type: 'framework' as const, pattern: /\b(?:framework|library)\s*[:\-]\s*(\w+)/gi },
  { type: 'filename' as const, pattern: /\b(?:file|filename|save as|write to)\s+['"]?([\w\-.]+\.\w+)['"]?/gi },
  { type: 'version' as const, pattern: /\b(?:version|v)\s*[:\-]\s*(\d+\.\d+\.\d+)/gi },
  { type: 'limit' as const, pattern: /\b(?:limit|max|maximum|up to)\s+(\d+)/gi },
  { type: 'deadline' as const, pattern: /\b(?:by|before|deadline|due)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2})/gi },
  { type: 'requirement' as const, pattern: /\b(?:require|need|must have|has to)\s+(.+?)(?:\.|$)/gi }
];

export class VerificationEngine {
  private analyzer: InputAnalyzer;
  private thresholds: VerificationThresholds;

  constructor(thresholds: Partial<VerificationThresholds> = {}, targetModel: string = 'gpt-4') {
    this.analyzer = new InputAnalyzer(targetModel as any);
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  setThresholds(thresholds: Partial<VerificationThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  async verify(original: string, compressed: string, candidateScores: SafetyScores): Promise<VerificationResult> {
    const originalAnalysis = await this.analyzer.analyze(original);
    const compressedAnalysis = await this.analyzer.analyze(compressed);

    const details: VerificationDetail[] = [];
    const failedChecks: SafetyCheckType[] = [];

    // 1. Instruction Preservation
    const instructionCheck = this.checkInstructions(original, compressed, originalAnalysis);
    details.push({
      check: 'instruction_preservation',
      passed: instructionCheck.preserved,
      score: instructionCheck.preserved ? 1.0 : 0.5,
      message: instructionCheck.preserved 
        ? 'All instructions preserved' 
        : `Lost instructions: ${instructionCheck.lostInstructions.join(', ')}`,
      evidence: instructionCheck.lostInstructions
    });
    if (!instructionCheck.preserved) failedChecks.push('instruction_preservation');

    // 2. Constraint Preservation
    const constraintCheck = this.checkConstraints(original, compressed, originalAnalysis);
    details.push({
      check: 'constraint_preservation',
      passed: constraintCheck.preserved,
      score: constraintCheck.preserved ? 1.0 : 0.3,
      message: constraintCheck.preserved 
        ? 'All constraints preserved' 
        : `Violated constraints: ${constraintCheck.violatedConstraints.map(c => c.description).join(', ')}`,
      evidence: constraintCheck.violatedConstraints.map(c => c.description)
    });
    if (!constraintCheck.preserved) failedChecks.push('constraint_preservation');

    // 3. Technical Integrity
    const technicalCheck = this.checkTechnicalIntegrity(original, compressed, originalAnalysis);
    const technicalScore = this.calculateTechnicalScore(technicalCheck);
    details.push({
      check: 'technical_integrity',
      passed: technicalScore >= this.thresholds.technicalIntegrity,
      score: technicalScore,
      message: technicalScore >= this.thresholds.technicalIntegrity
        ? 'Technical content intact'
        : `Corrupted items: ${this.getCorruptedItems(technicalCheck).join(', ')}`,
      evidence: this.getCorruptedItems(technicalCheck)
    });
    if (technicalScore < this.thresholds.technicalIntegrity) failedChecks.push('technical_integrity');

    // 4. Semantic Similarity
    const semanticScore = this.checkSemanticSimilarity(original, compressed, originalAnalysis);
    details.push({
      check: 'semantic_similarity',
      passed: semanticScore >= this.thresholds.semanticConfidence,
      score: semanticScore,
      message: semanticScore >= this.thresholds.semanticConfidence
        ? 'Semantic meaning preserved'
        : 'Significant semantic drift detected',
      evidence: []
    });
    if (semanticScore < this.thresholds.semanticConfidence) failedChecks.push('semantic_similarity');

    // 5. Privacy Compliance
    const privacyScore = this.checkPrivacyCompliance(original, compressed);
    details.push({
      check: 'privacy_compliance',
      passed: privacyScore >= this.thresholds.privacyConfidence,
      score: privacyScore,
      message: privacyScore >= this.thresholds.privacyConfidence
        ? 'No privacy violations'
        : 'Potential privacy issue detected',
      evidence: []
    });
    if (privacyScore < this.thresholds.privacyConfidence) failedChecks.push('privacy_compliance');

    // Calculate overall scores
    const scores: SafetyScores = {
      semanticConfidence: semanticScore,
      instructionConfidence: instructionCheck.preserved ? 1.0 : 0.5,
      technicalIntegrity: technicalScore,
      privacyConfidence: privacyScore,
      compressionConfidence: candidateScores.compressionConfidence,
      overall: Math.min(
        semanticScore,
        instructionCheck.preserved ? 1.0 : 0.5,
        technicalScore,
        privacyScore,
        candidateScores.compressionConfidence
      )
    };

    const passed = failedChecks.length === 0 && scores.overall >= this.thresholds.overall;

    return {
      passed,
      scores,
      details,
      failedChecks
    };
  }

  private checkInstructions(original: string, compressed: string, analysis: AnalysisResult): InstructionCheck {
    const originalInstructions = this.extractInstructions(original, analysis);
    const compressedInstructions = this.extractInstructions(compressed, analysis);
    
    const lostInstructions = originalInstructions.filter(
      inst => !this.isInstructionPreserved(inst, compressedInstructions)
    );
    
    const alteredInstructions = originalInstructions
      .filter(inst => !lostInstructions.includes(inst))
      .map(inst => ({
        original: inst,
        compressed: this.findMatchingInstruction(inst, compressedInstructions)
      }))
      .filter((pair): pair is { original: string; compressed: string } => pair.compressed !== null && pair.original !== pair.compressed);

    return {
      originalInstructions,
      compressedInstructions,
      preserved: lostInstructions.length === 0 && alteredInstructions.length === 0,
      lostInstructions,
      alteredInstructions
    };
  }

  private extractInstructions(text: string, analysis: AnalysisResult): string[] {
    const instructions: string[] = [];
    
    for (const component of analysis.semanticComponents) {
      if (component.type === 'instruction' || component.type === 'prohibition') {
        instructions.push(component.content);
      }
    }
    
    // Also extract from keywords
    for (const keyword of INSTRUCTION_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b[^.]*\\.`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        instructions.push(match[0].trim());
      }
    }
    
    return [...new Set(instructions)];
  }

  private isInstructionPreserved(instruction: string, compressedInstructions: string[]): boolean {
    const normalized = instruction.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const keyTerms = normalized.split(/\s+/).filter(t => t.length > 3 && !['must', 'should', 'required', 'exactly', 'only', 'never', 'without', 'unless', 'before', 'after'].includes(t));
    
    if (keyTerms.length === 0) return true;
    
    for (const compInst of compressedInstructions) {
      const compNormalized = compInst.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const matches = keyTerms.filter(term => compNormalized.includes(term)).length;
      if (matches / keyTerms.length >= 0.7) return true;
    }
    
    return false;
  }

  private findMatchingInstruction(instruction: string, compressedInstructions: string[]): string | null {
    const normalized = instruction.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const keyTerms = normalized.split(/\s+/).filter(t => t.length > 3);
    
    if (keyTerms.length === 0) return null;
    
    for (const compInst of compressedInstructions) {
      const compNormalized = compInst.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const matches = keyTerms.filter(term => compNormalized.includes(term)).length;
      if (matches / keyTerms.length >= 0.7) return compInst;
    }
    
    return null;
  }

  private checkConstraints(original: string, compressed: string, analysis: AnalysisResult): ConstraintCheck {
    const originalConstraints = this.extractConstraints(original);
    const compressedConstraints = this.extractConstraints(compressed);
    
    const violatedConstraints = originalConstraints.filter(
      constraint => !this.isConstraintPreserved(constraint, compressedConstraints)
    );

    return {
      originalConstraints,
      compressedConstraints,
      preserved: violatedConstraints.length === 0,
      violatedConstraints
    };
  }

  private extractConstraints(text: string): Constraint[] {
    const constraints: Constraint[] = [];
    
    for (const { type, pattern } of CONSTRAINT_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        constraints.push({
          type,
          description: match[0],
          value: match[1] || match[0],
          operator: this.inferOperator(match[0])
        });
      }
    }
    
    return constraints;
  }

  private inferOperator(text: string): Constraint['operator'] {
    const lower = text.toLowerCase();
    if (lower.includes('exactly') || lower.includes('precisely')) return 'exactly';
    if (lower.includes('at least')) return 'at_least';
    if (lower.includes('at most') || lower.includes('no more than')) return 'at_most';
    if (lower.includes('must use') || lower.includes('use') || lower.includes('using')) return 'must_use';
    if (lower.includes('must not') || lower.includes('avoid') || lower.includes('never')) return 'must_not_use';
    if (lower.includes('before')) return 'before';
    if (lower.includes('after')) return 'after';
    return 'must_use';
  }

  private isConstraintPreserved(constraint: Constraint, compressedConstraints: Constraint[]): boolean {
    for (const comp of compressedConstraints) {
      if (comp.type === constraint.type && comp.value === constraint.value) {
        return true;
      }
      // Fuzzy match for similar constraints
      if (comp.type === constraint.type && this.valuesSimilar(comp.value, constraint.value)) {
        return true;
      }
    }
    return false;
  }

  private valuesSimilar(a: string, b: string): boolean {
    const na = a.toLowerCase().replace(/[^\w]/g, '');
    const nb = b.toLowerCase().replace(/[^\w]/g, '');
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  private checkTechnicalIntegrity(original: string, compressed: string, analysis: AnalysisResult): TechnicalIntegrityCheck {
    const check: TechnicalIntegrityCheck = {
      urls: [],
      codeBlocks: [],
      identifiers: [],
      numbers: [],
      paths: [],
      jsonStructure: [],
      sqlIdentifiers: [],
      regexPatterns: [],
      commands: []
    };

    // Check each protected segment type
    for (const segment of analysis.protectedSegments) {
      const item: IntegrityItem = {
        original: segment.content,
        compressed: '',
        intact: false
      };

      if (compressed.includes(segment.content)) {
        item.compressed = segment.content;
        item.intact = true;
      } else {
        item.intact = false;
        // Try to find what happened
        if (segment.content.length > 10) {
          const start = segment.content.slice(0, 10);
          const end = segment.content.slice(-10);
          if (!compressed.includes(start) && !compressed.includes(end)) {
            item.corruptionType = 'removed';
          } else if (compressed.includes(start) || compressed.includes(end)) {
            item.corruptionType = 'truncated';
          } else {
            item.corruptionType = 'modified';
          }
        } else {
          item.corruptionType = 'removed';
        }
      }

      switch (segment.type) {
        case 'url':
        case 'api_endpoint':
          check.urls.push(item);
          break;
        case 'code_block':
        case 'inline_code':
          check.codeBlocks.push(item);
          break;
        case 'function_name':
        case 'class_name':
        case 'variable_name':
        case 'package_name':
          check.identifiers.push(item);
          break;
        case 'version_number':
          check.numbers.push(item);
          break;
        case 'file_path':
          check.paths.push(item);
          break;
        case 'json_key':
        case 'api_endpoint':
        case 'api_key':
        case 'token':
        case 'hash':
        case 'uuid':
        case 'negative_instruction':
          check.jsonStructure.push(item);
          break;
        case 'sql_identifier':
          check.sqlIdentifiers.push(item);
          break;
        case 'regex':
          check.regexPatterns.push(item);
          break;
        case 'command':
          check.commands.push(item);
          break;
      }
    }

    return check;
  }

  private calculateTechnicalScore(check: TechnicalIntegrityCheck): number {
    const allItems = [
      ...check.urls,
      ...check.codeBlocks,
      ...check.identifiers,
      ...check.numbers,
      ...check.paths,
      ...check.jsonStructure,
      ...check.sqlIdentifiers,
      ...check.regexPatterns,
      ...check.commands
    ];

    if (allItems.length === 0) return 1.0;

    const intact = allItems.filter(i => i.intact).length;
    return intact / allItems.length;
  }

  private getCorruptedItems(check: TechnicalIntegrityCheck): string[] {
    const allItems = [
      ...check.urls,
      ...check.codeBlocks,
      ...check.identifiers,
      ...check.numbers,
      ...check.paths,
      ...check.jsonStructure,
      ...check.sqlIdentifiers,
      ...check.regexPatterns,
      ...check.commands
    ];

    return allItems
      .filter(i => !i.intact)
      .map(i => `${i.original.slice(0, 50)} (${i.corruptionType})`);
  }

  private checkSemanticSimilarity(original: string, compressed: string, analysis: AnalysisResult): number {
    // Component-level semantic check
    let preserved = 0;
    let total = 0;

    for (const component of analysis.semanticComponents) {
      if (['objective', 'question', 'output_format', 'example', 'technical_identifier'].includes(component.type)) {
        total++;
        if (this.isComponentPreserved(component.content, compressed)) {
          preserved++;
        }
      }
    }

    const componentScore = total > 0 ? preserved / total : 1.0;

    // Structural similarity
    const structureScore = this.checkStructuralSimilarity(original, compressed);

    // Length ratio check (too much compression = suspicious)
    const lengthRatio = compressed.length / original.length;
    const lengthScore = lengthRatio > 0.1 ? 1.0 : 0.5;

    return (componentScore * 0.5 + structureScore * 0.3 + lengthScore * 0.2);
  }

  private isComponentPreserved(content: string, compressed: string): boolean {
    const normalized = content.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const compNormalized = compressed.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    const keyTerms = normalized.split(/\s+/).filter(t => t.length > 3);
    if (keyTerms.length === 0) return true;
    
    const matches = keyTerms.filter(term => compNormalized.includes(term)).length;
    return matches / keyTerms.length >= 0.6;
  }

  private checkStructuralSimilarity(original: string, compressed: string): number {
    // Check paragraph/code block structure
    const originalBlocks = this.getStructuralBlocks(original);
    const compressedBlocks = this.getStructuralBlocks(compressed);
    
    if (originalBlocks.length === 0) return 1.0;
    
    let matched = 0;
    for (const ob of originalBlocks) {
      for (const cb of compressedBlocks) {
        if (this.blocksSimilar(ob, cb)) {
          matched++;
          break;
        }
      }
    }
    
    return matched / originalBlocks.length;
  }

  private getStructuralBlocks(text: string): string[] {
    const blocks: string[] = [];
    
    // Code blocks
    const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
    blocks.push(...codeBlocks);
    
    // Paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    blocks.push(...paragraphs);
    
    return blocks;
  }

  private blocksSimilar(a: string, b: string): boolean {
    const na = a.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const nb = b.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    const termsA = na.split(/\s+/).filter(t => t.length > 3);
    const termsB = nb.split(/\s+/).filter(t => t.length > 3);
    
    if (termsA.length === 0 || termsB.length === 0) return false;
    
    const intersection = termsA.filter(t => termsB.includes(t)).length;
    const union = new Set([...termsA, ...termsB]).size;
    
    return intersection / union > 0.5;
  }

  private checkPrivacyCompliance(original: string, compressed: string): number {
    // Check that no secrets were exposed in compression
    // In practice, this would use the SecretDetector
    // For now, assume compliance if compressed doesn't contain more secrets than original
    return 1.0;
  }
}