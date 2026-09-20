import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

export const ContentTypeSchema = z.enum([
  'prose',
  'coding_prompt',
  'code',
  'logs',
  'sql',
  'json',
  'yaml',
  'xml',
  'markdown',
  'terminal_commands',
  'git_diff',
  'tables',
  'mathematical_notation',
  'urls',
  'configuration_files',
  'unknown'
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export const CompressionTierSchema = z.enum(['tier0', 'deterministic', 'cloud_ai']);
export type CompressionTier = z.infer<typeof CompressionTierSchema>;

export const ProviderTypeSchema = z.enum(['groq', 'deterministic']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProcessingModeSchema = z.enum(['server', 'cloud']);
export type ProcessingMode = z.infer<typeof ProcessingModeSchema>;

export const SafetyCheckTypeSchema = z.enum([
  'instruction_preservation',
  'constraint_preservation',
  'technical_integrity',
  'semantic_similarity',
  'privacy_compliance'
]);
export type SafetyCheckType = z.infer<typeof SafetyCheckTypeSchema>;

// ============================================================================
// Tokenizer Types
// ============================================================================

export const TargetModelSchema = z.enum([
  'gpt-4',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-2',
  'gemini-pro',
  'gemini-1.5-pro',
  'llama-3-70b',
  'llama-3-8b',
  'qwen-2.5-72b',
  'phi-4-mini',
  'custom'
]);

export type TargetModel = z.infer<typeof TargetModelSchema>;

export interface TokenizerConfig {
  model: TargetModel;
  customTokenizer?: string;
  estimationOnly?: boolean;
}

export interface TokenCountResult {
  tokens: number;
  characters: number;
  model: TargetModel;
  estimationMethod: 'exact' | 'approximate';
}

export interface Tokenizer {
  name: string;
  supportedModels: TargetModel[];
  countTokens(text: string, model: TargetModel): Promise<TokenCountResult>;
  encode(text: string, model: TargetModel): Promise<number[]>;
  decode(tokens: number[], model: TargetModel): Promise<string>;
}

// ============================================================================
// Analyzer Types
// ============================================================================

export interface SemanticComponent {
  type: 'objective' | 'instruction' | 'constraint' | 'requirement' | 'prohibition' | 'question' | 'output_format' | 'example' | 'technical_identifier' | 'name' | 'number' | 'date' | 'version' | 'file_path' | 'function_name' | 'variable_name' | 'class_name' | 'url' | 'secret';
  content: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface AnalysisResult {
  contentType: ContentType;
  semanticComponents: SemanticComponent[];
  complexity: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  hasCodeBlocks: boolean;
  hasInlineCode: boolean;
  hasUrls: boolean;
  hasSecrets: boolean;
  protectedSegments: ProtectedSegment[];
  language?: string;
  structure?: 'flat' | 'nested' | 'structured';
}

export interface ProtectedSegment {
  type: 'code_block' | 'inline_code' | 'url' | 'file_path' | 'api_endpoint' | 'api_key' | 'token' | 'hash' | 'uuid' | 'version_number' | 'package_name' | 'function_name' | 'class_name' | 'variable_name' | 'json_key' | 'sql_identifier' | 'regex' | 'latex' | 'command' | 'quoted_string' | 'explicit_constraint' | 'negative_instruction';
  content: string;
  startIndex: number;
  endIndex: number;
  reason: string;
}

// ============================================================================
// Compressor Types
// ============================================================================

export interface CompressionCandidate {
  id: string;
  originalText: string;
  compressedText: string;
  tier: CompressionTier;
  provider: ProviderType;
  model?: string;
  grossTokenReduction: number;
  compressionOverhead: number;
  netTokenSavings: number;
  safetyScores: SafetyScores;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SafetyScores {
  semanticConfidence: number;
  instructionConfidence: number;
  technicalIntegrity: number;
  privacyConfidence: number;
  compressionConfidence: number;
  overall: number;
}

export interface CompressionResult {
  originalText: string;
  bestCandidate: CompressionCandidate | null;
  allCandidates: CompressionCandidate[];
  accepted: boolean;
  rejectionReason?: string;
  processingTimeMs: number;
  originalTokens: number;
  finalTokens: number;
  grossReduction: number;
  compressionOverhead: number;
  netSavings: number;
  provider: ProviderType;
  mode: ProcessingMode;
  forcedTargetResult?: boolean;
}

export interface CompressionOptions {
  targetModel: TargetModel;
  /** The selected UX preset, used to select and rank safe candidates. */
  compressionTarget?: CompressionTarget;
  /** Desired output-token reduction. This is a safety-bounded target, not a guarantee. */
  targetReductionRatio?: number;
  /** Lower bound used when deciding whether the requested target was achieved. */
  minimumReductionRatio?: number;
  /** Upper bound used to avoid selecting an unnecessarily over-compressed result. */
  maximumReductionRatio?: number;
  maxCompressionRatio?: number;
  preserveFormatting?: boolean;
  verificationThresholds?: VerificationThresholds;
  /**
   * When true (default), return the safest verified result even if it falls
   * outside the selected target range. When false, reject the result if no
   * verified candidate lands inside the target range.
   */
  safeResultMode?: boolean;
}

// ============================================================================
// Verification Types
// ============================================================================

export interface VerificationThresholds {
  semanticConfidence: number;
  instructionConfidence: number;
  technicalIntegrity: number;
  privacyConfidence: number;
  compressionConfidence: number;
  overall: number;
}

export interface VerificationResult {
  passed: boolean;
  scores: SafetyScores;
  details: VerificationDetail[];
  failedChecks: SafetyCheckType[];
}

export interface VerificationDetail {
  check: SafetyCheckType;
  passed: boolean;
  score: number;
  message: string;
  evidence?: string[];
}

export interface InstructionCheck {
  originalInstructions: string[];
  compressedInstructions: string[];
  preserved: boolean;
  lostInstructions: string[];
  alteredInstructions: { original: string; compressed: string }[];
}

export interface ConstraintCheck {
  originalConstraints: Constraint[];
  compressedConstraints: Constraint[];
  preserved: boolean;
  violatedConstraints: Constraint[];
}

export interface Constraint {
  type: 'count' | 'format' | 'technology' | 'language' | 'framework' | 'filename' | 'version' | 'limit' | 'deadline' | 'requirement';
  description: string;
  value: string;
  operator: 'exactly' | 'at_least' | 'at_most' | 'must_use' | 'must_not_use' | 'before' | 'after';
}

export interface TechnicalIntegrityCheck {
  urls: IntegrityItem[];
  codeBlocks: IntegrityItem[];
  identifiers: IntegrityItem[];
  numbers: IntegrityItem[];
  paths: IntegrityItem[];
  jsonStructure: IntegrityItem[];
  sqlIdentifiers: IntegrityItem[];
  regexPatterns: IntegrityItem[];
  commands: IntegrityItem[];
}

export interface IntegrityItem {
  original: string;
  compressed: string;
  intact: boolean;
  corruptionType?: 'modified' | 'removed' | 'truncated' | 'hallucinated';
}

// ============================================================================
// Provider Types
// ============================================================================

export interface LLMProvider {
  name: string;
  type: ProviderType;
  generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse>;
  healthCheck(): Promise<ProviderHealth>;
  getModel(): string;
  getCapabilities(): ProviderCapabilities;
  estimateCost(inputTokens: number, outputTokens: number): number;
  getStatus(): ProviderStatus;
}

export interface GenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: 'stop' | 'length' | 'error' | 'content_filter';
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  modelAvailable?: boolean;
  lastChecked: number;
}

export interface ProviderCapabilities {
  streaming: boolean;
  jsonMode: boolean;
  functionCalling: boolean;
  maxContextTokens: number;
  supportedModels: string[];
}

export type ProviderStatus = 'available' | 'unavailable' | 'loading' | 'error' | 'rate_limited' | 'quota_exceeded';

export interface GroqConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

// ============================================================================
// Privacy Types
// ============================================================================

export interface SecretDetectionResult {
  hasSecrets: boolean;
  secrets: DetectedSecret[];
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface DetectedSecret {
  type: 'api_key' | 'password' | 'jwt' | 'oauth_token' | 'private_key' | 'aws_credentials' | 'github_token' | 'database_credentials' | 'environment_variable' | 'generic_secret';
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  maskedValue: string;
}

export interface PrivacySettings {
  neverSendSecrets: boolean;
  maskSecretsInLogs: boolean;
}

// ============================================================================
// Settings Types (Web Client)
// ============================================================================

export interface AppSettings {
  general: GeneralSettings;
  privacy: PrivacySettings;
  targetModel: TargetModelSettings;
  advanced: AdvancedSettings;
}

export interface GeneralSettings {
  compressionTarget: CompressionTarget;
  safeResultMode: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface TargetModelSettings {
  tokenizer: TargetModel;
  customTokenizerPath?: string;
}

export interface AdvancedSettings {
  timeouts: {
    groq: number;
    verification: number;
  };
  retryCount: number;
  verificationThresholds: VerificationThresholds;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  diagnostics: boolean;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface AnalyticsData {
  totalPrompts: number;
  totalOriginalTokens: number;
  totalOptimizedTokens: number;
  grossTokensSaved: number;
  compressionOverhead: number;
  netTokensSaved: number;
  averageLatencyMs: number;
  failureRate: number;
  byProvider: Record<string, ProviderAnalytics>;
  byContentType: Record<string, ContentTypeAnalytics>;
}

export interface ProviderAnalytics {
  prompts: number;
  originalTokens: number;
  optimizedTokens: number;
  netSavings: number;
  averageLatencyMs: number;
  failureCount: number;
}

export interface ContentTypeAnalytics {
  prompts: number;
  averageReduction: number;
  averageNetSavings: number;
}

// ============================================================================
// Benchmark Types
// ============================================================================

export interface BenchmarkCase {
  id: string;
  name: string;
  category: BenchmarkCategory;
  input: string;
  expectedMinReduction: number;
  expectedMaxReduction: number;
  mustPreserve: string[];
  mustNotContain: string[];
  targetModel: TargetModel;
  tags: string[];
}

export const BenchmarkCategorySchema = z.enum([
  'normal_prompts',
  'coding_prompts',
  'debugging_prompts',
  'long_prompts',
  'sql',
  'json',
  'logs',
  'markdown',
  'mathematics',
  'technical_documentation',
  'creative_prompts',
  'multi_step_instructions',
  'constraint_heavy_prompts',
  'adversarial_prompts',
  'configuration_files'
]);

export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;

export interface BenchmarkResult {
  caseId: string;
  originalTokens: number;
  compressedTokens: number;
  grossReduction: number;
  netReduction: number;
  semanticPreservation: number;
  instructionPreservation: number;
  constraintPreservation: number;
  codeIntegrity: number;
  urlIntegrity: number;
  secretDetection: number;
  latencyMs: number;
  memoryUsageMb: number;
  passed: boolean;
  failures: string[];
}

export interface BenchmarkReport {
  timestamp: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageTokenReduction: number;
  averageNetTokenReduction: number;
  averageSemanticPreservation: number;
  averageInstructionPreservation: number;
  averageConstraintPreservation: number;
  averageCodeIntegrity: number;
  averageUrlIntegrity: number;
  averageSecretDetection: number;
  averageLatencyMs: number;
  results: BenchmarkResult[];
}

// ============================================================================
// Error Types
// ============================================================================

export class TokenTrimError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: 'provider' | 'tokenizer' | 'verification' | 'privacy' | 'compression' | 'configuration' | 'unknown',
    public readonly recoverable: boolean,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TokenTrimError';
  }
}

export class ProviderError extends TokenTrimError {
  constructor(
    message: string,
    public readonly provider: ProviderType,
    public readonly originalError?: Error
  ) {
    super(message, 'PROVIDER_ERROR', 'provider', true, { provider });
    this.name = 'ProviderError';
  }
}

export class VerificationError extends TokenTrimError {
  constructor(
    message: string,
    public readonly failedChecks: SafetyCheckType[],
    public readonly scores: SafetyScores
  ) {
    super(message, 'VERIFICATION_FAILED', 'verification', false, { failedChecks, scores });
    this.name = 'VerificationError';
  }
}

export class PrivacyError extends TokenTrimError {
  constructor(
    message: string,
    public readonly detectedSecrets: DetectedSecret[]
  ) {
    super(message, 'PRIVACY_VIOLATION', 'privacy', false, { detectedSecrets });
    this.name = 'PrivacyError';
  }
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export const CompressionTargetSchema = z.enum(['conservative', 'balanced', 'aggressive', 'extreme']);
export type CompressionTarget = z.infer<typeof CompressionTargetSchema>;

/**
 * Output-token reduction presets. The lower and upper bounds deliberately
 * leave a small tolerance: exact percentages are not always safe for prompts
 * containing code, identifiers, or explicit constraints.
 */
export const COMPRESSION_TARGETS: Record<CompressionTarget, {
  label: string;
  targetReductionRatio: number;
  minimumReductionRatio: number;
  maximumReductionRatio: number;
  description: string;
}> = {
  conservative: {
    label: 'Conservative',
    targetReductionRatio: 0.20,
    minimumReductionRatio: 0.17,
    maximumReductionRatio: 0.23,
    description: 'Aim for 20% reduction while retaining nearly all phrasing.'
  },
  balanced: {
    label: 'Balanced',
    targetReductionRatio: 0.35,
    minimumReductionRatio: 0.30,
    maximumReductionRatio: 0.40,
    description: 'Aim for 35% reduction with concise wording.'
  },
  aggressive: {
    label: 'Aggressive',
    targetReductionRatio: 0.50,
    minimumReductionRatio: 0.45,
    maximumReductionRatio: 0.55,
    description: 'Aim for 50% reduction while preserving every requirement.'
  },
  extreme: {
    label: 'Extreme',
    targetReductionRatio: 0.75,
    minimumReductionRatio: 0.68,
    maximumReductionRatio: 0.80,
    description: 'Aim for 75% reduction; complex or protected prompts may safely reduce less.'
  }
};

export const ApiCompressionRequestSchema = z.object({
  text: z.string().min(1, 'Text is required').max(100_000, 'Text too large'),
  targetModel: TargetModelSchema.default('gpt-4'),
  compressionTarget: CompressionTargetSchema.default('balanced'),
  safeResultMode: z.boolean().default(true)
});
export type ApiCompressionRequest = z.infer<typeof ApiCompressionRequestSchema>;

export interface ApiCompressionResponse {
  success: boolean;
  data: {
    compressedText: string;
    originalTokens: number;
    compressedTokens: number;
    grossReduction: number;
    compressionOverhead: number;
    netSavings: number;
    provider: ProviderType;
    tier: CompressionTier;
    safetyScores: SafetyScores;
    processingTimeMs: number;
    accepted: boolean;
    rejectionReason?: string;
    compressionTarget?: CompressionTarget;
    targetReductionPercent?: number;
    actualReductionPercent?: number;
    targetAchieved?: boolean;
    safeResultMode?: boolean;
    forcedTargetResult?: boolean;
  } | null;
  error?: ApiError;
}

export const ApiPrivacyScanRequestSchema = z.object({
  text: z.string().min(1, 'Text is required').max(100_000, 'Text too large')
});
export type ApiPrivacyScanRequest = z.infer<typeof ApiPrivacyScanRequestSchema>;

export interface ApiPrivacyScanResponse {
  hasSecrets: boolean;
  riskLevel: SecretDetectionResult['riskLevel'];
  secretTypes: string[];
  secretCount: number;
}

export interface ApiHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  providers: {
    groq: ProviderHealth;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_ERROR_CODES = {
  SECRETS_DETECTED: 'SECRETS_DETECTED',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

// ============================================================================
// Legacy Compat Types (used by CompressionRequest in core engine)
// ============================================================================

export interface CompressionRequest {
  text: string;
  options: CompressionOptions;
}

export interface CompressionResponse {
  result: CompressionResult;
  error?: string;
}

export interface BenchmarkRunOptions {
  categories?: BenchmarkCategory[];
  targetModel?: TargetModel;
  limit?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface Result<T, E = Error> {
  ok: boolean;
  value?: T;
  error?: E;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
