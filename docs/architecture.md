# TokenTrim Architecture

## Overview

TokenTrim follows a modular, package-based architecture designed for safety, extensibility, and local-first privacy.

## Core Principles

1. **Local-First**: All processing happens locally by default
2. **Verification Over Trust**: AI output is never trusted blindly
3. **Safe Compression > Maximum Compression**: Reject unsafe candidates
4. **NET Savings**: Account for compression overhead
5. **Extensibility**: Pluggable tokenizers, providers, verifiers

## Package Dependency Graph

```
@tokentrim/desktop (app)
    │
    ├── @tokentrim/core (orchestration)
    │       │
    │       ├── @tokentrim/analyzer
    │       ├── @tokentrim/compressor
    │       │       ├── @tokentrim/analyzer
    │       │       └── @tokentrim/tokenizer
    │       ├── @tokentrim/tokenizer
    │       ├── @tokentrim/verifier
    │       │       └── @tokentrim/analyzer
    │       ├── @tokentrim/providers
    │       ├── @tokentrim/privacy
    │       └── @tokentrim/telemetry
    │
    └── @tokentrim/shared (types)
```

## Data Flow

```
┌─────────────┐
│ User Input  │
└──────┬──────┘
       ▼
┌─────────────┐
│  Analyzer   │ ──► Content Type, Semantic Components, Protected Segments
└──────┬──────┘
       ▼
┌─────────────┐
│   Privacy   │ ──► Secret Detection, Cloud Eligibility
│  Detector   │
└──────┬──────┘
       ▼
┌─────────────┐
│  Tokenizer  │ ──► Original Token Count (target model)
└──────┬──────┘
       ▼
┌─────────────┐
│  Tier 0     │ ──► Deterministic Candidate (if beneficial)
│ Compressor  │
└──────┬──────┘
       ▼
┌─────────────┐
│  Verifier   │ ──► Safety Scores (if Tier 0 candidate)
└──────┬──────┘
       ▼
┌─────────────┐     No/Insufficient      ┌─────────────┐
│  Accepted?  │ ─────────────────────────►│   Phi-4     │
│ (Tier 0)    │                            │  (Local)    │
└──────┬──────┘                            └──────┬──────┘
       │ Yes                                        ▼
       ▼                                   ┌─────────────┐
┌─────────────┐                            │  Generate   │
│  Output     │                            │ Candidates  │
│  (Tier 0)   │                            │ (min/mod/   │
└─────────────┘                            │  aggressive)│
                                           └──────┬──────┘
                                                  ▼
                                           ┌─────────────┐
                                           │  Verify All │
                                           │ Candidates  │
                                           └──────┬──────┘
                                                  ▼
                                           ┌─────────────┐
                                           │ Best Valid  │
                                           │  Candidate  │
                                           └──────┬──────┘
                                                  │
                       ┌──────────────────────────┘
                       ▼
              ┌─────────────────┐     No/Failed      ┌─────────────┐
              │  Accepted?      │ ──────────────────►│   Groq      │
              │ (Local AI)      │                    │  (Cloud)    │
              └────────┬────────┘                    └──────┬──────┘
                       │ Yes                                 ▼
                       ▼                              ┌─────────────┐
              ┌─────────────────┐                     │  Generate   │
              │  Output         │                     │ Candidates  │
              │ (Local AI)      │                     │  (verify)   │
              └─────────────────┘                     └──────┬──────┘
                                                              ▼
                                                       ┌─────────────┐
                                                       │  Verify &   │
                                                       │  Select Best│
                                                       └──────┬──────┘
                                                              │
                                                              ▼
                                                     ┌─────────────┐
                                                     │  Final      │
                                                     │  Output     │
                                                     └─────────────┘
```

## Key Components

### Analyzer (`@tokentrim/analyzer`)

**Responsibilities:**
- Content type classification (15+ types)
- Semantic component extraction (15+ types)
- Protected segment detection (20+ types)
- Language detection
- Complexity assessment
- Structure analysis

**Implementation:** Rule-based with regex patterns, no ML dependencies.

### Tier 0 Compressor (`@tokentrim/compressor`)

**Responsibilities:**
- Deterministic, rule-based compression
- Zero AI overhead
- Zero privacy risk
- Preserves all protected segments

**Rules Applied (in order):**
1. Whitespace normalization
2. Redundant phrase removal
3. List compression
4. Punctuation normalization
5. Filler word removal
6. Abbreviations (aggressive mode)
7. Example compression (aggressive mode)

### AI Compressor (`@tokentrim/compressor`)

**Responsibilities:**
- Multi-candidate generation via LLM
- System prompt enforcement
- Protected segment verification
- Safety scoring

**Candidate Levels:**
- **Minimal**: Remove only obvious redundancy
- **Moderate**: Standard compression with abbreviations
- **Aggressive**: Maximum compression preserving critical elements

### Verifier (`@tokentrim/verifier`)

**Responsibilities:**
- Instruction preservation verification
- Constraint preservation verification
- Technical integrity verification
- Semantic similarity scoring
- Privacy compliance check

**Checks:**
| Check | Method | Threshold |
|-------|--------|-----------|
| Instructions | Keyword + semantic matching | 0.95 |
| Constraints | Pattern extraction + comparison | 0.95 |
| Technical | Protected segment byte comparison | 0.99 |
| Semantic | Component + structural similarity | 0.85 |
| Privacy | Secret detection | 1.0 |

### Provider Abstraction (`@tokentrim/providers`)

**Interface:**
```typescript
interface LLMProvider {
  generate(prompt, options): ProviderResponse
  healthCheck(): ProviderHealth
  getModel(): string
  getCapabilities(): ProviderCapabilities
  estimateCost(inputTokens, outputTokens): number
  getStatus(): ProviderStatus
}
```

**Implementations:**
- `OllamaProvider`: Local, free, Phi-4-mini default
- `GroqProvider`: Cloud, paid, multiple models

**Groq Resilience:**
- Exponential backoff retry
- Circuit breaker (5 failures → 60s cooldown)
- Rate limit handling (respects Retry-After)
- Auth error detection

### Tokenizer Registry (`@tokentrim/tokenizer`)

**Registry Pattern:**
```typescript
TokenizerRegistry
  ├── TiktokenTokenizer (GPT models - exact)
  ├── GenericEstimator (Claude, Gemini, Llama, etc. - approximate)
  └── Extensible for custom tokenizers
```

**Target Model Configuration:**
```typescript
{
  model: 'gpt-4' | 'claude-3-opus' | 'gemini-pro' | ...,
  customTokenizer?: string,
  estimationOnly?: boolean
}
```

### Privacy Engine (`@tokentrim/privacy`)

**Secret Detection:**
- 15+ pattern categories
- Confidence scoring
- Overlap resolution (highest confidence wins)
- Risk level classification

**Cloud Policy:**
```typescript
{
  neverSendSecrets: true,
  allowCloudProcessing: false,
  requireCloudConfirmation: true,
  maskSecretsInLogs: true,
  localOnlyMode: false
}
```

### Telemetry (`@tokentrim/telemetry`)

**Metrics Tracked:**
- Total prompts, tokens, savings
- By provider (deterministic, ollama, groq)
- By content type
- Latency, failure rates, cloud escalation
- Privacy-first: no prompt content stored

## Safety Scoring

Each candidate receives 5 scores (0-1):

```
semanticConfidence      // Meaning preserved
instructionConfidence   // Explicit instructions intact
technicalIntegrity      // Code, URLs, identifiers intact
privacyConfidence       // No secrets leaked
compressionConfidence   // Process reliability
```

**Overall = min(all scores)**

**Acceptance:** All individual scores above threshold AND overall above threshold.

## NET Token Savings

```
Gross Savings = Original Tokens - Compressed Tokens
Overhead = AI Input Tokens + AI Output Tokens
NET Savings = Gross Savings - Overhead
Cost Savings = NET Savings × Model Price / 1M
```

**Decision:** Only accept if NET Savings > 0.

## Electron Security

### Main Process
- No `nodeIntegration` in renderer
- `contextIsolation: true`
- `sandbox: true`
- Preload script with allowlisted IPC

### IPC Channels (Allowlisted)
```
Renderer → Main (invoke):
  compress:request
  settings:get/set/reset
  analytics:get
  benchmark:run
  provider:health/models
  privacy:scan
  app:version/quit
  window:minimize/maximize/close/isMaximized

Main → Renderer (send):
  compression:complete
  navigate
  settings:updated
  provider:status
  log:info/warn/error
```

### CSP
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' http://localhost:11434 https://api.groq.com;
```

## Extensibility Points

### Adding a Tokenizer
1. Implement `Tokenizer` interface
2. Register in `TokenizerRegistry` constructor
3. Add model to `TargetModel` enum

### Adding a Provider
1. Implement `LLMProvider` interface
2. Add to `ProviderFactory`
3. Add config type to `ProviderFactoryOptions`

### Adding a Verification Check
1. Add to `SafetyCheckType` enum
2. Implement in `VerificationEngine.verify()`
3. Add threshold to `VerificationThresholds`

### Adding a Benchmark Category
1. Add to `BenchmarkCategory` enum
2. Add test cases to `BENCHMARK_CASES`
3. Define expected preservation criteria

## Performance Targets

| Metric | Target |
|--------|--------|
| Tier 0 Latency | <10ms |
| Phi-4-mini Latency | 100-300ms |
| Groq Latency | 50-200ms |
| Verification | <50ms |
| Memory (Tier 0) | <10MB |
| Memory (AI) | <100MB |

## Quality Gates

- All safety scores must exceed thresholds
- NET token savings must be positive
- No secret leakage (verified by privacy engine)
- Technical integrity 99%+ (byte-for-byte for protected)
- Instruction preservation 95%+
- All tests passing in CI