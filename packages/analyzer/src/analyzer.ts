import {
  AnalysisResult,
  ContentType,
  SemanticComponent,
  ProtectedSegment,
  TargetModel
} from '@tokentrim/shared';
import { tokenizerRegistry } from '@tokentrim/tokenizer';

const CONTENT_TYPE_PATTERNS: Array<{ type: ContentType; patterns: RegExp[]; weight: number }> = [
  {
    type: 'code',
    patterns: [
      /```[\s\S]*?```/g,
      /`[^`\n]+`/g,
      /\b(?:function|const|let|var|class|interface|type|import|export|return|if|else|for|while|switch|case|try|catch|finally)\b/g
    ],
    weight: 10
  },
  {
    type: 'coding_prompt',
    patterns: [
      /\b(?:write|create|implement|build|develop|code|program|function|algorithm|debug|fix|refactor|optimize)\b/gi,
      /\b(?:python|javascript|typescript|java|c\+\+|go|rust|swift|kotlin)\b/gi,
      /\b(?:api|endpoint|database|sql|query|schema|model|controller|service|component)\b/gi
    ],
    weight: 8
  },
  {
    type: 'sql',
    patterns: [
      /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN|WHERE|GROUP BY|ORDER BY|HAVING)\b/gi,
      /\b(?:FROM|INTO|VALUES|SET|ON|INNER|LEFT|RIGHT|FULL|OUTER)\b/gi
    ],
    weight: 9
  },
  {
    type: 'json',
    patterns: [
      /^\s*\{[\s\S]*\}\s*$/m,
      /^\s*\[[\s\S]*\]\s*$/m
    ],
    weight: 8
  },
  {
    type: 'yaml',
    patterns: [
      /^[\w-]+:\s*.+$/m,
      /^\s+-\s+.+$/m
    ],
    weight: 7
  },
  {
    type: 'xml',
    patterns: [
      /<\?xml.*\?>/,
      /<[^>]+>[\s\S]*<\/[^>]+>/
    ],
    weight: 7
  },
  {
    type: 'markdown',
    patterns: [
      /^#{1,6}\s+.+$/m,
      /^\s*[-*+]\s+.+$/m,
      /^\s*\d+\.\s+.+$/m,
      /\[.+\]\(.+\)/g
    ],
    weight: 6
  },
  {
    type: 'logs',
    patterns: [
      /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g,
      /\b(?:ERROR|WARN|INFO|DEBUG|TRACE)\b/g,
      /\[\w+\]\s.+/g
    ],
    weight: 6
  },
  {
    type: 'terminal_commands',
    patterns: [
      /^\$\s+.+$/m,
      /^>\s+.+$/m,
      /\b(?:ls|cd|git|npm|yarn|pnpm|docker|kubectl|aws|gcloud)\b/g
    ],
    weight: 6
  },
  {
    type: 'git_diff',
    patterns: [
      /^diff --git/m,
      /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m,
      /^[+-].+$/m
    ],
    weight: 9
  },
  {
    type: 'mathematical_notation',
    patterns: [
      /\$[\s\S]*?\$/g,
      /\\[a-zA-Z]+\b/g,
      /\b(?:sum|int|lim|prod|sqrt|frac|partial|infty|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega)\b/gi
    ],
    weight: 5
  },
  {
    type: 'urls',
    patterns: [
      /https?:\/\/[^\s]+/g,
      /ftp:\/\/[^\s]+/g,
      /www\.[^\s]+/g
    ],
    weight: 5
  },
  {
    type: 'configuration_files',
    patterns: [
      /\.(?:json|yaml|yml|toml|ini|conf|config|env|properties)\b/gi,
      /^\s*[\w-]+\s*[=:]\s*.+$/m
    ],
    weight: 5
  }
];

const SEMANTIC_PATTERNS: Array<{ type: SemanticComponent['type']; pattern: RegExp; extractor?: (match: RegExpMatchArray) => string }> = [
  {
    type: 'objective',
    pattern: /\b(?:goal|objective|aim|purpose|task|mission)\s*[:-]\s*(.+)/gi
  },
{
    type: 'instruction',
    pattern: /\b(?:you must|you should|ensure|make sure|remember to|don't forget to)\s+(.+)/gi
},
  {
    type: 'constraint',
    pattern: /\b(?:constraint|limit|restriction|boundary|maximum|minimum|exactly|precisely|at most|at least|no more than|no less than)\s+(.+)/gi
  },
  {
    type: 'requirement',
    pattern: /\b(?:required|must have|needs to|has to|obligatory|mandatory)\s+(.+)/gi
  },
  {
    type: 'prohibition',
    pattern: /\b(?:must not|should not|never|do not|don't|avoid|prohibited|forbidden|disallowed)\s+(.+)/gi
  },
  {
    type: 'question',
    pattern: /\b(?:what|how|why|when|where|who|which|can you|could you|would you)\s+.+\?/gi
  },
  {
    type: 'output_format',
    pattern: /\b(?:return|output|format|respond|reply|answer)\s+(?:in|as|with|using)\s+(?:json|xml|yaml|markdown|csv|table|list|bullet points|numbered)\b/gi
  },
  {
    type: 'example',
    pattern: /\b(?:example|for instance|such as|e\.g\.|i\.e\.)\s*[:-]?\s*(.+)/gi
  },
  {
    type: 'technical_identifier',
    pattern: /\b[a-z_][a-z0-9_]*\(\)/g
  },
  {
    type: 'function_name',
    pattern: /\b(?:function|def|fn|func)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
  },
  {
    type: 'class_name',
    pattern: /\bclass\s+([A-Z][a-zA-Z0-9_]*)\b/g
  },
  {
    type: 'variable_name',
    pattern: /\b(?:const|let|var|val|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g
  },
  {
    type: 'version',
    pattern: /\bv?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\b/g
  },
  {
    type: 'file_path',
    pattern: /(?:^|\s)(?:~\/|\.\/|\/|\w:\\)[\w/\\.-]+/g
  },
  {
    type: 'url',
    pattern: /https?:\/\/[^\s]+/g
  },
  {
    type: 'number',
    pattern: /\b\d+(?:\.\d+)?\b/g
  },
  {
    type: 'date',
    pattern: /\b\d{4}-\d{2}-\d{2}\b/g
  }
];

const PROTECTED_PATTERNS: Array<{ type: ProtectedSegment['type']; pattern: RegExp; reason: string }> = [
  { type: 'code_block', pattern: /```[\s\S]*?```/g, reason: 'Code block must remain intact' },
  { type: 'inline_code', pattern: /`[^`\n]+`/g, reason: 'Inline code must remain intact' },
  { type: 'url', pattern: /https?:\/\/[^\s]+/g, reason: 'URLs must not be modified' },
  { type: 'file_path', pattern: /(?:^|\s)(?:~\/|\.\/|\/|\w:\\)[\w/\\.-]+/g, reason: 'File paths must remain intact' },
  { type: 'api_endpoint', pattern: /\/(?:api|v\d+)\/[^\s]+/g, reason: 'API endpoints must remain intact' },
  { type: 'api_key', pattern: /\b(?:sk|pk|rk)_[a-zA-Z0-9]{24,}\b/g, reason: 'API keys must not be exposed' },
  { type: 'token', pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, reason: 'Tokens must not be exposed' },
  { type: 'hash', pattern: /\b[a-f0-9]{32,64}\b/g, reason: 'Hashes must remain intact' },
  { type: 'uuid', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, reason: 'UUIDs must remain intact' },
  { type: 'version_number', pattern: /\bv?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\b/g, reason: 'Version numbers must remain intact' },
  { type: 'package_name', pattern: /\b@?[a-z0-9-]+\/[a-z0-9-]+\b/g, reason: 'Package names must remain intact' },
  { type: 'function_name', pattern: /\b[a-zA-Z_][a-zA-Z0-9_]*\(\)/g, reason: 'Function names must remain intact' },
  { type: 'class_name', pattern: /\bclass\s+[A-Z][a-zA-Z0-9_]*\b/g, reason: 'Class names must remain intact' },
  { type: 'variable_name', pattern: /\b(?:const|let|var)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=/g, reason: 'Variable declarations must remain intact' },
  { type: 'json_key', pattern: /"[^"]+"\s*:/g, reason: 'JSON keys must remain intact' },
  { type: 'sql_identifier', pattern: /\b(?:SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE|CREATE|TABLE|INDEX|COLUMN)\b/gi, reason: 'SQL identifiers must remain intact' },
  { type: 'regex', pattern: /\/(?:[^/\\]|\\.)+\/[gimsuy]*/g, reason: 'Regex patterns must remain intact' },
  { type: 'latex', pattern: /\$[\s\S]*?\$/g, reason: 'LaTeX must remain intact' },
  { type: 'command', pattern: /^\$\s+.+$/gm, reason: 'Commands must remain intact' },
  { type: 'quoted_string', pattern: /"[^"]*"|'[^']*'/g, reason: 'Quoted strings must remain intact' },
  { type: 'explicit_constraint', pattern: /\b(?:exactly|precisely|must|required|only|never|without|unless)\b/gi, reason: 'Explicit constraints must be preserved' },
  { type: 'negative_instruction', pattern: /\b(?:do not|don't|must not|should not|avoid|never)\b/gi, reason: 'Negative instructions must be preserved' }
];

export class InputAnalyzer {
  private targetModel: TargetModel;

  constructor(targetModel: TargetModel = 'gpt-4') {
    this.targetModel = targetModel;
  }

  setTargetModel(model: TargetModel): void {
    this.targetModel = model;
  }

  async analyze(text: string): Promise<AnalysisResult> {
    const contentType = this.detectContentType(text);
    const semanticComponents = this.extractSemanticComponents(text);
    const protectedSegments = this.detectProtectedSegments(text);
    const estimatedTokens = await this.estimateTokens(text);
    
    const hasCodeBlocks = /```[\s\S]*?```/.test(text);
    const hasInlineCode = /`[^`\n]+`/.test(text);
    const hasUrls = /https?:\/\/[^\s]+/.test(text);
    const hasSecrets = this.hasSecrets(text);

    return {
      contentType,
      semanticComponents,
      complexity: this.assessComplexity(text, semanticComponents),
      estimatedTokens,
      hasCodeBlocks,
      hasInlineCode,
      hasUrls,
      hasSecrets,
      protectedSegments,
      language: this.detectLanguage(text),
      structure: this.detectStructure(text)
    };
  }

  private detectContentType(text: string): ContentType {
    const scores: Record<ContentType, number> = {
      prose: 1,
      coding_prompt: 0,
      code: 0,
      logs: 0,
      sql: 0,
      json: 0,
      yaml: 0,
      xml: 0,
      markdown: 0,
      terminal_commands: 0,
      git_diff: 0,
      tables: 0,
      mathematical_notation: 0,
      urls: 0,
      configuration_files: 0,
      unknown: 0
    };

    for (const { type, patterns, weight } of CONTENT_TYPE_PATTERNS) {
      let matches = 0;
      for (const pattern of patterns) {
        const found = text.match(pattern);
        if (found) matches += found.length;
      }
      scores[type] += matches * weight;
    }

    let maxType: ContentType = 'prose';
    let maxScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxType = type as ContentType;
      }
    }

    return maxScore > 0 ? maxType : 'prose';
  }

  private extractSemanticComponents(text: string): SemanticComponent[] {
    const components: SemanticComponent[] = [];

    for (const { type, pattern, extractor } of SEMANTIC_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const content = extractor ? extractor(match) : match[0];
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        components.push({
          type,
          content: content.trim(),
          startIndex,
          endIndex,
          confidence: this.calculateConfidence(type, content)
        });

        if (!pattern.global) break;
      }
    }

    return components.sort((a, b) => a.startIndex - b.startIndex);
  }

  private calculateConfidence(type: SemanticComponent['type'], _content: string): number {
    const baseConfidence: Record<SemanticComponent['type'], number> = {
      objective: 0.8,
      instruction: 0.9,
      constraint: 0.95,
      requirement: 0.9,
      prohibition: 0.95,
      question: 0.85,
      output_format: 0.9,
      example: 0.7,
      technical_identifier: 0.8,
      name: 0.7,
      number: 0.6,
      date: 0.8,
      version: 0.9,
      file_path: 0.85,
      function_name: 0.85,
      class_name: 0.85,
      variable_name: 0.8,
      url: 0.95,
      secret: 0.99
    };

    return baseConfidence[type] || 0.5;
  }

  private detectProtectedSegments(text: string): ProtectedSegment[] {
    const segments: ProtectedSegment[] = [];

    for (const { type, pattern, reason } of PROTECTED_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        segments.push({
          type,
          content: match[0],
          startIndex,
          endIndex,
          reason
        });

        if (!pattern.global) break;
      }
    }

    return segments.sort((a, b) => a.startIndex - b.startIndex);
  }

  private hasSecrets(text: string): boolean {
    const secretPatterns = [
      /\b(?:sk|pk|rk)_[a-zA-Z0-9]{24,}\b/,
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
      /\bAKIA[0-9A-Z]{16}\b/,
      /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/
    ];

    return secretPatterns.some(p => p.test(text));
  }

  private assessComplexity(text: string, components: SemanticComponent[]): 'low' | 'medium' | 'high' {
    const tokenEstimate = text.length / 4;
    const componentCount = components.length;
    const hasConstraints = components.some(c => c.type === 'constraint' || c.type === 'prohibition');
    const hasCode = text.includes('```') || text.includes('`');

    if (tokenEstimate > 2000 || componentCount > 20 || (hasConstraints && hasCode)) return 'high';
    if (tokenEstimate > 500 || componentCount > 10 || hasCode || hasConstraints) return 'medium';
    return 'low';
  }

  private detectLanguage(text: string): string | undefined {
    const langPatterns: Record<string, RegExp> = {
      python: /\b(?:def|class|import|from|if|elif|else|for|while|try|except|with|lambda|yield|async|await)\b/,
      javascript: /\b(?:function|const|let|var|=>|async|await|import|export|class|extends|implements)\b/,
      typescript: /\b(?:interface|type|enum|namespace|declare|abstract|implements|readonly)\b/,
      java: /\b(?:public|private|protected|static|void|class|interface|extends|implements|package|import)\b/,
      go: /\b(?:func|package|import|type|struct|interface|chan|go|select|defer)\b/,
      rust: /\b(?:fn|let|mut|struct|enum|impl|trait|mod|use|pub|async|await)\b/,
      sql: /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN|WHERE|GROUP BY)\b/i
    };

    for (const [lang, pattern] of Object.entries(langPatterns)) {
      if (pattern.test(text)) return lang;
    }

    return undefined;
  }

  private detectStructure(text: string): 'flat' | 'nested' | 'structured' {
    const lines = text.split('\n');
    const indentLevels = new Set<number>();
    
    for (const line of lines) {
      const indent = line.match(/^\s*/)?.[0].length || 0;
      if (indent > 0) indentLevels.add(indent);
    }

    if (indentLevels.size > 1) return 'nested';
    if (text.includes('```') || text.startsWith('{') || text.startsWith('[')) return 'structured';
    return 'flat';
  }

  private async estimateTokens(text: string): Promise<number> {
    const result = await tokenizerRegistry.countTokens(text, { model: this.targetModel });
    return result.tokens;
  }
}