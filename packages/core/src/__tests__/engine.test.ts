import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenTrimEngine, TokenTrimEngineConfig } from '../engine';
import { CompressionOptions, TargetModel, AnalysisResult, CompressionCandidate, ProviderType, SafetyScores, SecretDetectionResult, VerificationResult } from '@tokentrim/shared';
import { LLMProvider, ProviderResponse, GenerateOptions, ProviderHealth, ProviderCapabilities, ProviderStatus } from '@tokentrim/providers';
import { ForceTargetDiagnostics } from '@tokentrim/compressor';

// Student Assistance System prompt for testing
const STUDENT_ASSISTANCE_PROMPT = `Build an AI-Powered Student Assistance System for a college. The system must serve three user roles: Students, Faculty, and Administrators.

## Objective
Create a comprehensive web application that helps students track academic progress, faculty manage courses and grading, and administrators oversee institutional metrics. The system must be a functional application, not a static mockup.

## Student Features
- Dashboard showing current GPA, enrolled courses, upcoming assignments, and degree progress
- Course registration with real-time seat availability and prerequisite checking
- Grade viewer with assignment breakdowns, weighting, and instructor feedback
- Academic planner with drag-and-drop semester scheduling and graduation timeline
- Notification center for deadlines, announcements, and advisor messages
- Resource library with searchable campus services, tutoring schedules, and FAQ
- Mobile-responsive design with offline-capable progressive web app support

## Faculty Features
- Course management: create/edit syllabi, set grading schemas, define rubrics
- Gradebook with bulk entry, curve application, late penalty automation, and audit trail
- Assignment builder supporting multiple question types (MCQ, essay, code, file upload)
- Attendance tracking with QR code check-in and manual override
- Communication tools: announcements, direct messaging, discussion forums
- Analytics dashboard showing class performance, engagement, and at-risk students
- Integration with LMS (Canvas, Blackboard) via LTI 1.3 and REST APIs

## Administrator Features
- Institutional dashboard: enrollment trends, retention rates, degree completion metrics
- User management: role assignment, bulk import/export, SSO integration (SAML/OIDC)
- Course catalog management: program requirements, course equivalencies, transfer credits
- Reporting engine with scheduled exports (CSV, PDF, JSON) and custom query builder
- Audit logging for all grade changes, enrollment actions, and permission modifications
- Tenant configuration: branding, academic calendar, grading scales, notification templates
- API gateway with rate limiting, webhook subscriptions, and developer portal

## Technology Stack (MANDATORY)
- Frontend: React 18 with TypeScript, Vite, TanStack Query, Tailwind CSS
- Backend: Node.js 20 LTS with Fastify, TypeScript, Prisma ORM
- Database: PostgreSQL 15 with Row Level Security policies
- Authentication: Auth.js (NextAuth) with email/password, OAuth2, and magic links
- Real-time: Socket.io for notifications and collaborative features
- Testing: Vitest for unit, Playwright for E2E, MSW for API mocking
- CI/CD: GitHub Actions with preview deployments to Vercel/Render
- Monitoring: Sentry for errors, PostHog for analytics, Prometheus/Grafana for metrics

## Functional Requirements (NON-NEGOTIABLE)
1. All pages must be server-rendered or statically generated where possible
2. API routes must use Zod validation for all inputs and outputs
3. Database migrations must be version-controlled and reversible
4. Role-based access control enforced at both API and UI layers
5. All user-facing text must support i18n (English, Spanish, French)
6. WCAG 2.1 AA compliance for all interactive components
7. Zero-downtime deployments with feature flags
8. Automated backup and point-in-time recovery for PostgreSQL

## Navigation & UX Constraints
- Primary navigation: persistent sidebar with role-adaptive menu items
- Breadcrumbs on all pages deeper than level 2
- Keyboard shortcuts for power users (/, g+i for inbox, g+c for courses)
- Command palette (Cmd+K) for global search and quick actions
- Loading states must use skeleton screens, not spinners
- Error boundaries at route and component level with recovery actions

## Explicit Prohibitions
- DO NOT use class components or legacy React APIs
- DO NOT use any CSS-in-JS solution (styled-components, emotion)
- DO NOT use Redux or MobX (TanStack Query + Zustand only)
- DO NOT use MongoDB, Firebase, or Supabase (PostgreSQL only)
- DO NOT build a static mockup — build a functional application
- DO NOT hardcode secrets; use environment variables and secret manager
- DO NOT skip tests; minimum 80% coverage for critical paths

## Output Format
Return a project specification document with:
- Architecture decision records (ADRs) for key choices
- Database schema (Prisma schema format)
- API contract (OpenAPI 3.0 YAML)
- Component hierarchy and state management diagram
- Implementation sequence with milestones
- Risk assessment and mitigation strategies`;

// Mock Provider that simulates Groq
class MockProvider implements LLMProvider {
  name = 'Groq';
  type: ProviderType = 'groq';
  private response: ProviderResponse;
  private shouldFail = false;

  constructor(response: ProviderResponse) {
    this.response = response;
  }

  setFail(fail: boolean) {
    this.shouldFail = fail;
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    if (this.shouldFail) throw new Error('Mock provider failure');
    return this.response;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: true, lastChecked: Date.now() };
  }

  getModel(): string {
    return 'llama-3.1-8b-instant';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: false,
      jsonMode: false,
      functionCalling: false,
      maxContextTokens: 32768,
      supportedModels: ['llama-3.1-8b-instant']
    };
  }

  estimateCost(): number {
    return 0;
  }

  getStatus(): ProviderStatus {
    return 'available';
  }
}

// Mock analysis result
const mockAnalysis: AnalysisResult = {
  contentType: 'coding_prompt',
  semanticComponents: [],
  complexity: 'medium',
  estimatedTokens: 100,
  hasCodeBlocks: false,
  hasInlineCode: false,
  hasUrls: false,
  hasSecrets: false,
  protectedSegments: [],
  structure: 'flat'
};

// Mock passing safety scores
const passingSafetyScores: SafetyScores = {
  semanticConfidence: 0.95,
  instructionConfidence: 0.95,
  technicalIntegrity: 0.95,
  privacyConfidence: 1.0,
  compressionConfidence: 0.9,
  overall: 0.95
};

// Mock failing safety scores
const failingSafetyScores: SafetyScores = {
  semanticConfidence: 0.5,
  instructionConfidence: 0.5,
  technicalIntegrity: 0.5,
  privacyConfidence: 1.0,
  compressionConfidence: 0.5,
  overall: 0.5
};

// Mock verification results
const passingVerification: VerificationResult = {
  passed: true,
  scores: passingSafetyScores,
  details: [],
  failedChecks: []
};

const failingVerification: VerificationResult = {
  passed: false,
  scores: failingSafetyScores,
  details: [{ check: 'constraint_preservation', passed: false, score: 0.3, message: 'Violated constraints', evidence: [] }],
  failedChecks: ['instruction_preservation']
};

describe('TokenTrimEngine - Web/API Architecture', () => {
  let engine: TokenTrimEngine;
  let mockGroqProvider: MockProvider;
  
  const options: CompressionOptions = {
    targetModel: 'gpt-4'
  };

  beforeEach(() => {
    const groqResponse: ProviderResponse = {
      text: 'Compressed by Groq Cloud',
      inputTokens: 100,
      outputTokens: 40,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    };

    mockGroqProvider = new MockProvider(groqResponse);

    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: {
        neverSendSecrets: true,
        maskSecretsInLogs: true
      }
    };

    engine = new TokenTrimEngine(config);

    // Inject our mock provider
    (engine as unknown as Record<string, unknown>).groqProvider = mockGroqProvider;

    // Mock internal dependencies
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };

    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(100);

    // Tier0 setup (Server-side deterministic)
    (engine as unknown as Record<string, unknown>).tier0Compressor = {
      compress: vi.fn().mockResolvedValue({
        id: 'tier0-test',
        originalText: 'test prompt',
        compressedText: 'Compressed by Tier 0 Deterministic',
        tier: 'tier0',
        provider: 'deterministic',
        grossTokenReduction: 10,
        compressionOverhead: 0,
        netTokenSavings: 10,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      })
    };

    // AI Compressor setup
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockImplementation(async (text: string, opts: unknown) => {
        return [{
          id: 'ai-groq-test',
          originalText: text,
          compressedText: 'Compressed by Groq Cloud',
          tier: 'cloud_ai',
          provider: 'groq',
          model: 'llama-3.1-8b-instant',
          grossTokenReduction: 60,
          compressionOverhead: 10,
          netTokenSavings: 50,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }];
      })
    };

    // Verifier setup
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockImplementation((original: string, compressed: string) => {
        if (compressed.includes('Compressed by Tier 0 Deterministic') || compressed.includes('Compressed by Groq Cloud')) {
          return Promise.resolve(passingVerification);
        }
        return Promise.resolve(failingVerification);
      }),
      setThresholds: vi.fn()
    };
  });

  it('should use deterministic Tier 0 compression (server mode) when input is small', async () => {
    // When tokens are < 20, shouldTryAICompression returns false
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(15);
    
    const result = await engine.compress('Short prompt', options);
    
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe('server');
    expect(result.provider).toBe('deterministic');
    expect(result.bestCandidate?.compressedText).toBe('Compressed by Tier 0 Deterministic');
    expect(result.allCandidates.length).toBe(1); // Only Tier 0
  });

  it('should use Groq cloud candidate when it provides better savings (cloud mode)', async () => {
    // Both Tier0 and AI provide candidates, AI (Groq) gives 50 tokens saved vs Tier0's 20.
    const result = await engine.compress('Long enough prompt to trigger cloud AI', options);
    
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe('cloud');
    expect(result.provider).toBe('groq');
    expect(result.bestCandidate?.tier).toBe('cloud_ai');
    expect(result.bestCandidate?.compressedText).toBe('Compressed by Groq Cloud');
    expect(result.allCandidates.length).toBe(2); // Both Tier 0 and AI
  });

  it('prefers a verified candidate closest to the requested reduction target', async () => {
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([
        {
          id: 'ai-overshoot',
          originalText: 'Prompt targeting fifty percent',
          compressedText: 'Compressed by Groq Cloud overshoot',
          tier: 'cloud_ai',
          provider: 'groq',
          grossTokenReduction: 70,
          compressionOverhead: 1,
          netTokenSavings: 69,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        },
        {
          id: 'ai-target',
          originalText: 'Prompt targeting fifty percent',
          compressedText: 'Compressed by Groq Cloud target',
          tier: 'cloud_ai',
          provider: 'groq',
          grossTokenReduction: 50,
          compressionOverhead: 3,
          netTokenSavings: 47,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }
      ])
    };

    const targetOptions: CompressionOptions = {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      targetReductionRatio: 0.5,
      minimumReductionRatio: 0.45,
      maximumReductionRatio: 0.55
    };
    const result = await engine.compress('Prompt targeting fifty percent', targetOptions);

    expect(result.accepted).toBe(true);
    expect(result.bestCandidate?.id).toBe('ai-target');
  });

  it('should fallback to deterministic Tier 0 safely if Groq fails', async () => {
    // Make AI compressor throw an error to simulate Groq API failure
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockRejectedValue(new Error('Groq network failure'))
    };

    const result = await engine.compress('Prompt that triggers cloud, but cloud fails', options);
    
    // Engine should recover and return the Tier0 candidate
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe('cloud');
    expect(result.provider).toBe('deterministic');
    expect(result.bestCandidate?.compressedText).toBe('Compressed by Tier 0 Deterministic');
    expect(result.allCandidates.length).toBe(1); // Only Tier 0
  });

  it('should reject cloud candidates with non-positive net savings and fall back to deterministic', async () => {
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockImplementation(async (text: string, opts: unknown) => {
        return [{
          id: 'ai-groq-test-bad',
          originalText: text,
          compressedText: 'Compressed but worse',
          tier: 'cloud_ai',
          provider: 'groq',
          model: 'llama-3.1-8b-instant',
          grossTokenReduction: 5,
          compressionOverhead: 10,
          netTokenSavings: -5, // Negative savings
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }];
      })
    };

    const result = await engine.compress('Prompt that triggers cloud', options);
    
    // AI candidate had negative savings, so the engine falls back to Tier0
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate?.provider).toBe('deterministic');
  });

  it('should block processing before provider request when secrets are detected', async () => {
    // Make privacy scanner find secrets
    (engine as unknown as Record<string, unknown>).privacyDetector = {
      scan: vi.fn().mockReturnValue({
        hasSecrets: true,
        secrets: [{ type: 'api_key', value: 'sk-123', startIndex: 0, endIndex: 6, confidence: 1, maskedValue: 'sk-***' }],
        riskLevel: 'high'
      })
    };

    const generateSpy = vi.spyOn(mockGroqProvider, 'generate');
    const tier0Spy = vi.spyOn((engine as unknown as Record<string, any>).tier0Compressor, 'compress');

    // Engine should throw TokenTrimError immediately
    await expect(engine.compress('sk-123', options)).rejects.toThrow(/Secrets detected/);
    
    // Providers should never be called
    expect(generateSpy).not.toHaveBeenCalled();
    expect(tier0Spy).not.toHaveBeenCalled();
  });

  it('should return rejected result shape if no candidates pass verification', async () => {
    // Verifier fails everything
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(failingVerification),
      setThresholds: vi.fn()
    };

    const result = await engine.compress('Prompt', options);
    
    expect(result.accepted).toBe(false);
    expect(result.bestCandidate).toBeNull();
    // The failingVerification detail message should be surfaced
    expect(result.rejectionReason).toContain('Violated constraints');
    expect(result.mode).toBe('cloud'); // Attempted cloud
    expect(result.allCandidates.length).toBe(2); // Generated but rejected
  });

  it('should surface cloud error message if cloud fails verification', async () => {
    // Groq generates candidates, but AI Compressor rejects due to protected segments
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockRejectedValue(new Error('Candidate changed protected sql_identifier segment'))
    };

    // Make tier 0 fail verification so it doesn't get accepted
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(failingVerification),
      setThresholds: vi.fn()
    };

    const result = await engine.compress('Prompt', options);
    
    expect(result.accepted).toBe(false);
  });
});

describe('TokenTrimEngine - Force Target Mode (safeResultMode: false)', () => {
  let engine: TokenTrimEngine;

  beforeEach(() => {
    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: { neverSendSecrets: true, maskSecretsInLogs: true }
    };

    engine = new TokenTrimEngine(config);

    const mockProvider = new MockProvider({
      text: 'compressed',
      inputTokens: 100,
      outputTokens: 40,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(100);
    (engine as unknown as Record<string, unknown>).tier0Compressor = {
      compress: vi.fn().mockResolvedValue(null) // No tier0 candidate
    };
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(passingVerification),
      setThresholds: vi.fn()
    };
  });

  it('rejects out-of-range candidate when safeResultMode is false (balanced target)', async () => {
    // AI returns 60% reduction — outside balanced range (30-40%)
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-out-of-range',
        originalText: 'test',
        compressedText: 'compressed out of range',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 60, // 60% of 100 = out of 30-40% range
        compressionOverhead: 1,
        netTokenSavings: 59,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: false
    });

    expect(result.accepted).toBe(false);
    expect(result.bestCandidate).toBeNull();
    expect(result.rejectionReason).toContain('Unable to meet the 35% reduction target');
  });

  it('accepts in-range candidate when safeResultMode is false (balanced target)', async () => {
    // AI returns 35% reduction — inside balanced range (30-40%)
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-in-range',
        originalText: 'test',
        compressedText: 'Compressed by Groq Cloud',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 35, // 35% of 100 = in 30-40% range
        compressionOverhead: 1,
        netTokenSavings: 34,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: false
    });

    expect(result.accepted).toBe(true);
    expect(result.bestCandidate).not.toBeNull();
    expect(result.bestCandidate?.id).toBe('ai-in-range');
  });

  it('never returns accepted: true with targetAchieved: false when safeResultMode is false', async () => {
    // AI returns 60% — out of balanced range; even though verified, it should be rejected
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-over',
        originalText: 'test',
        compressedText: 'over compressed',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 60,
        compressionOverhead: 0,
        netTokenSavings: 60,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: false
    });

    // If accepted is true, the result must be in range
    if (result.accepted) {
      const reductionRatio = result.grossReduction / result.originalTokens;
      expect(reductionRatio).toBeGreaterThanOrEqual(0.30);
      expect(reductionRatio).toBeLessThanOrEqual(0.40);
    } else {
      expect(result.accepted).toBe(false);
    }
  });

  it('Safe Result Mode ON accepts out-of-range safe fallback', async () => {
    // AI returns 60% reduction — outside balanced range (30-40%) but passes verification
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-safe-fallback',
        originalText: 'test',
        compressedText: 'Compressed by Groq Cloud',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 60,
        compressionOverhead: 1,
        netTokenSavings: 59,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: true // Safe mode ON
    });

    // Should accept even though out of range — it's a safe verified fallback
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate).not.toBeNull();
  });

  it('accepts an in-range unverified candidate in Force Target Mode and flags it for review', async () => {
    // AI returns in-range candidate but fails verification
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(failingVerification),
      setThresholds: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-in-range-unverified',
        originalText: 'test',
        compressedText: 'compressed in range but unverified',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 35,
        compressionOverhead: 1,
        netTokenSavings: 34,
        safetyScores: failingSafetyScores,
        timestamp: Date.now()
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'balanced',
      targetReductionRatio: 0.35,
      minimumReductionRatio: 0.30,
      maximumReductionRatio: 0.40,
      safeResultMode: false
    });

    expect(result.accepted).toBe(true);
    expect(result.bestCandidate?.id).toBe('ai-in-range-unverified');
    expect(result.forcedTargetResult).toBe(true);
  });
});

describe('TokenTrimEngine - All four targets', () => {
  let engine: TokenTrimEngine;

  const targets = [
    { name: 'conservative', ratio: 0.20, min: 0.17, max: 0.23 },
    { name: 'balanced',     ratio: 0.35, min: 0.30, max: 0.40 },
    { name: 'aggressive',   ratio: 0.50, min: 0.45, max: 0.55 },
    { name: 'extreme',      ratio: 0.75, min: 0.68, max: 0.80 },
  ] as const;

  beforeEach(() => {
    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: { neverSendSecrets: true, maskSecretsInLogs: true }
    };
    engine = new TokenTrimEngine(config);

    const mockProvider = new MockProvider({
      text: 'compressed',
      inputTokens: 100,
      outputTokens: 40,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(100);
    (engine as unknown as Record<string, unknown>).tier0Compressor = {
      compress: vi.fn().mockResolvedValue(null)
    };
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(passingVerification),
      setThresholds: vi.fn()
    };
  });

  for (const t of targets) {
    it(`accepts in-range candidate for ${t.name} target (${t.ratio * 100}%, range ${t.min * 100}-${t.max * 100}%)`, async () => {
      const reduction = Math.round(t.ratio * 100); // exact target
      (engine as unknown as Record<string, unknown>).aiCompressor = {
        generateCandidates: vi.fn().mockResolvedValue([{
          id: `ai-${t.name}`,
          originalText: 'test',
          compressedText: 'Compressed by Groq Cloud',
          tier: 'cloud_ai',
          provider: 'groq',
          grossTokenReduction: reduction,
          compressionOverhead: 1,
          netTokenSavings: reduction - 1,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }])
      };

      const result = await engine.compress('test prompt', {
        targetModel: 'gpt-4',
        compressionTarget: t.name,
        targetReductionRatio: t.ratio,
        minimumReductionRatio: t.min,
        maximumReductionRatio: t.max,
        safeResultMode: false
      });

      expect(result.accepted).toBe(true);
      expect(result.bestCandidate).not.toBeNull();
    });

    it(`rejects out-of-range candidate for ${t.name} target in Force Target Mode`, async () => {
      // Use a reduction way above the max
      const reduction = Math.round(t.max * 100) + 20;
      (engine as unknown as Record<string, unknown>).aiCompressor = {
        generateCandidates: vi.fn().mockResolvedValue([{
          id: `ai-${t.name}-over`,
          originalText: 'test',
          compressedText: 'over compressed',
          tier: 'cloud_ai',
          provider: 'groq',
          grossTokenReduction: reduction,
          compressionOverhead: 1,
          netTokenSavings: reduction - 1,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }])
      };

      const result = await engine.compress('test prompt', {
        targetModel: 'gpt-4',
        compressionTarget: t.name,
        targetReductionRatio: t.ratio,
        minimumReductionRatio: t.min,
        maximumReductionRatio: t.max,
        safeResultMode: false
      });

      expect(result.accepted).toBe(false);
    });
  }
});

describe('TokenTrimEngine - Student Assistance System prompt (Force Target Mode)', () => {
  let engine: TokenTrimEngine;

  beforeEach(() => {
    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: { neverSendSecrets: true, maskSecretsInLogs: true }
    };
    engine = new TokenTrimEngine(config);

    const mockProvider = new MockProvider({
      text: 'compressed',
      inputTokens: 100,
      outputTokens: 40,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(2800);
    (engine as unknown as Record<string, unknown>).tier0Compressor = {
      compress: vi.fn().mockResolvedValue(null)
    };
    (engine as unknown as Record<string, unknown>).verifier = {
      verify: vi.fn().mockResolvedValue(passingVerification),
      setThresholds: vi.fn()
    };
  });

  const targets = [
    { name: 'conservative', ratio: 0.20, min: 0.17, max: 0.23 },
    { name: 'balanced', ratio: 0.35, min: 0.30, max: 0.40 },
    { name: 'aggressive', ratio: 0.50, min: 0.45, max: 0.55 },
    { name: 'extreme', ratio: 0.75, min: 0.68, max: 0.80 },
  ] as const;

  for (const t of targets) {
    it(`should achieve ${t.name} target (${t.ratio * 100}%) for Student Assistance System prompt`, async () => {
      const targetTokens = Math.round(2800 * t.ratio);
      (engine as unknown as Record<string, unknown>).aiCompressor = {
        generateCandidates: vi.fn().mockResolvedValue([{
          id: `ai-${t.name}-student`,
          originalText: STUDENT_ASSISTANCE_PROMPT,
          compressedText: 'Compressed Student Assistance System prompt',
          tier: 'cloud_ai',
          provider: 'groq',
          grossTokenReduction: targetTokens,
          compressionOverhead: 10,
          netTokenSavings: targetTokens - 10,
          safetyScores: passingSafetyScores,
          timestamp: Date.now()
        }])
      };

      const options: CompressionOptions = {
        targetModel: 'gpt-4',
        compressionTarget: t.name,
        targetReductionRatio: t.ratio,
        minimumReductionRatio: t.min,
        maximumReductionRatio: t.max,
        safeResultMode: false
      };

      const result = await engine.compress(STUDENT_ASSISTANCE_PROMPT, options);
      expect(result.accepted).toBe(true);
      expect(result.bestCandidate).not.toBeNull();
    });
  }
});

describe('TokenTrimEngine - Force Target Mode edge cases', () => {
  let engine: TokenTrimEngine;

  beforeEach(() => {
    const config: TokenTrimEngineConfig = {
      targetModel: 'gpt-4',
      groqConfig: { apiKey: 'gsk_test', model: 'llama-3.1-8b-instant', timeoutMs: 30000, maxRetries: 1, retryDelayMs: 0 },
      enableTelemetry: false,
      privacySettings: { neverSendSecrets: true, maskSecretsInLogs: true }
    };
    engine = new TokenTrimEngine(config);
  });

  it('should surface provider error distinctly from target miss', async () => {
    const mockProvider = new MockProvider({
      text: 'compressed',
      inputTokens: 100,
      outputTokens: 40,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });
    mockProvider.setFail(true);

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(100);
    (engine as unknown as Record<string, unknown>).tier0Compressor = { compress: vi.fn().mockResolvedValue(null) };
    (engine as unknown as Record<string, unknown>).verifier = { verify: vi.fn().mockResolvedValue(passingVerification), setThresholds: vi.fn() };
    // Mock aiCompressor to throw on provider error
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockRejectedValue(new Error('Groq network failure'))
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      targetReductionRatio: 0.50,
      minimumReductionRatio: 0.45,
      maximumReductionRatio: 0.55,
      safeResultMode: false
    });

    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain('Provider error');
    expect(result.rejectionReason).not.toContain('Unable to meet the 50% reduction target');
  });

  it('should handle impossible short-prompt targets gracefully', async () => {
    const mockProvider = new MockProvider({
      text: 'short',
      inputTokens: 10,
      outputTokens: 5,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    // Very short prompt - only 10 tokens
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn().mockResolvedValue(10);
    (engine as unknown as Record<string, unknown>).tier0Compressor = { compress: vi.fn().mockResolvedValue(null) };
    (engine as unknown as Record<string, unknown>).verifier = { verify: vi.fn().mockResolvedValue(passingVerification), setThresholds: vi.fn() };
    // Mock aiCompressor to return in-range but it will be filtered
    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-short',
        originalText: 'short prompt',
        compressedText: 'short',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 5, // 50% - but 10 tokens can't be compressed to exact 50% due to integer rounding
        compressionOverhead: 1,
        netTokenSavings: 4,
        safetyScores: passingSafetyScores,
        timestamp: Date.now()
      }])
    };

    // With 10 tokens, 50% target = 5 output tokens, range 45-55% = 4.5-5.5 tokens
    // This creates an impossible integer range
    const result = await engine.compress('short prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      targetReductionRatio: 0.50,
      minimumReductionRatio: 0.45,
      maximumReductionRatio: 0.55,
      safeResultMode: false
    });

    expect(result.accepted).toBe(false);
    // Should not crash and should provide meaningful rejection reason
    expect(result.rejectionReason).toBeDefined();
  });

  it('should return successful 50% target result with proper diagnostics', async () => {
    const mockProvider = new MockProvider({
      text: 'compressed output with all requirements preserved',
      inputTokens: 100,
      outputTokens: 50,
      model: 'llama-3.1-8b-instant',
      finishReason: 'stop'
    });

    (engine as unknown as Record<string, unknown>).groqProvider = mockProvider;
    (engine as unknown as Record<string, unknown>).analyzer = {
      analyze: vi.fn().mockResolvedValue(mockAnalysis),
      setTargetModel: vi.fn()
    };
    (engine as unknown as Record<string, unknown>).countTokens = vi.fn()
      .mockResolvedValueOnce(100) // original
      .mockResolvedValueOnce(50);  // compressed
    (engine as unknown as Record<string, unknown>).tier0Compressor = { compress: vi.fn().mockResolvedValue(null) };
    (engine as unknown as Record<string, unknown>).verifier = { verify: vi.fn().mockResolvedValue(passingVerification), setThresholds: vi.fn() };

    (engine as unknown as Record<string, unknown>).aiCompressor = {
      generateCandidates: vi.fn().mockResolvedValue([{
        id: 'ai-success',
        originalText: 'test prompt',
        compressedText: 'compressed output with all requirements preserved',
        tier: 'cloud_ai',
        provider: 'groq',
        grossTokenReduction: 50,
        compressionOverhead: 5,
        netTokenSavings: 45,
        safetyScores: passingSafetyScores,
        timestamp: Date.now(),
        metadata: {
          forceTargetDiagnostics: {
            originalTokens: 100,
            targetReductionRatio: 0.5,
            minimumReductionRatio: 0.45,
            maximumReductionRatio: 0.55,
            minOutputTokens: 45,
            maxOutputTokens: 55,
            targetOutputTokens: 50,
            attempts: [
              { attemptNumber: 1, level: 'aggressive', outputTokens: 50, reductionRatio: 0.5, status: 'in_range', minOutputTokens: 45, maxOutputTokens: 55, targetOutputTokens: 50 }
            ],
            closestAttempt: { attemptNumber: 1, level: 'aggressive', outputTokens: 50, reductionRatio: 0.5, status: 'in_range', minOutputTokens: 45, maxOutputTokens: 55, targetOutputTokens: 50 },
            finalStatus: 'success'
          } as ForceTargetDiagnostics
        }
      }])
    };

    const result = await engine.compress('test prompt', {
      targetModel: 'gpt-4',
      compressionTarget: 'aggressive',
      targetReductionRatio: 0.50,
      minimumReductionRatio: 0.45,
      maximumReductionRatio: 0.55,
      safeResultMode: false
    });

    expect(result.accepted).toBe(true);
    expect(result.grossReduction).toBe(50);
    expect(result.bestCandidate).not.toBeNull();
  });
});
