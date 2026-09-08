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

export const CompressionTierSchema = z.enum(['tier0', 'local_ai', 'cloud_ai']);
export type CompressionTier = z.infer<typeof CompressionTierSchema>;

export const ProviderTypeSchema = z.enum(['ollama', 'groq', 'deterministic']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProcessingModeSchema = z.enum(['local', 'cloud', 'hybrid']);
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
  estimatedCostSavings: number;
  provider: ProviderType;
  mode: ProcessingMode;
}

export interface CompressionOptions {
  targetModel: TargetModel;
  maxCompressionRatio?: number;
  preserveFormatting?: boolean;
  allowCloudFallback?: boolean;
  requireConfirmationForCloud?: boolean;
  verificationThresholds?: VerificationThresholds;
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

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  keepAlive?: string;
}

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
  allowCloudProcessing: boolean;
  requireCloudConfirmation: boolean;
  maskSecretsInLogs: boolean;
  localOnlyMode: boolean;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
  general: GeneralSettings;
  ai: AISettings;
  cloud: CloudSettings;
  privacy: PrivacySettings;
  targetModel: TargetModelSettings;
  advanced: AdvancedSettings;
}

export interface GeneralSettings {
  enabled: boolean;
  globalHotkey: string;
  compressionTarget: 'balanced' | 'aggressive' | 'conservative';
  previewMode: boolean;
  autoStart: boolean;
  minimizeToTray: boolean;
}

export interface AISettings {
  localEnabled: boolean;
  provider: 'ollama';
  model: string;
  endpoint: string;
  timeoutMs: number;
}

export interface CloudSettings {
  fallbackEnabled: boolean;
  provider: 'groq';
  model: string;
  apiKey: string; // encrypted in storage
  timeoutMs: number;
  maxRetries: number;
}

export interface TargetModelSettings {
  tokenizer: TargetModel;
  customTokenizerPath?: string;
}

export interface AdvancedSettings {
  timeouts: {
    ollama: number;
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
  estimatedMoneySaved: number;
  localCompressionPercentage: number;
  cloudCompressionPercentage: number;
  averageLatencyMs: number;
  failureRate: number;
  cloudEscalationRate: number;
  byProvider: Record<ProviderType, ProviderAnalytics>;
  byContentType: Record<ContentType, ContentTypeAnalytics>;
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
// IPC Types (Electron)
// ============================================================================

export interface IPCChannels {
  'compress:request': (payload: CompressionRequest) => Promise<CompressionResponse>;
  'compress:cancel': () => void;
  'settings:get': () => Promise<AppSettings>;
  'settings:set': (settings: Partial<AppSettings>) => Promise<void>;
  'settings:reset': () => Promise<void>;
  'analytics:get': () => Promise<AnalyticsData>;
  'benchmark:run': (options: BenchmarkRunOptions) => Promise<BenchmarkReport>;
  'provider:health': (provider: ProviderType) => Promise<ProviderHealth>;
  'provider:models': (provider: ProviderType) => Promise<string[]>;
  'privacy:scan': (text: string) => Promise<SecretDetectionResult>;
  'app:version': () => string;
  'app:quit': () => void;
}

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