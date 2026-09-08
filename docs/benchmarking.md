# Benchmarking Methodology

## Overview

TokenTrim uses a comprehensive benchmark framework to measure compression quality, safety, and performance across diverse prompt categories.

## Test Case Design

### Categories (14)

| Category | Description | Example Tags |
|----------|-------------|--------------|
| `normal_prompts` | General questions & requests | short, question |
| `coding_prompts` | Code generation tasks | python, function, edge-cases |
| `debugging_prompts` | Bug fixing requests | react, debugging, hooks |
| `long_prompts` | Extended prompts (>2000 tokens) | documentation, api |
| `sql` | SQL queries & optimization | postgresql, optimization |
| `json` | JSON data & schemas | config, validation |
| `logs` | Log analysis | error, debugging |
| `markdown` | Markdown content | docs, formatting |
| `mathematics` | Math notation & proofs | induction, proof |
| `technical_documentation` | API docs, guides | api, auth |
| `creative_prompts` | Writing, storytelling | creative, constraints |
| `multi_step_instructions` | Sequential workflows | workflow, strict-order |
| `constraint_heavy_prompts` | Strict formatting/negative constraints | json, negative-constraints |
| `adversarial_prompts` | Injection attempts, format preservation | injection, json, secrets |

### Test Case Structure

```typescript
interface BenchmarkCase {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name
  category: BenchmarkCategory;   // One of 14 categories
  input: string;                 // Original prompt
  expectedMinReduction: number;  // Min acceptable gross reduction (0-1)
  expectedMaxReduction: number;  // Max expected gross reduction (0-1)
  mustPreserve: string[];        // Terms that MUST appear in output
  mustNotContain: string[];      // Terms that MUST NOT appear
  targetModel: TargetModel;      // Tokenizer to use
  tags: string[];                // Descriptive tags
}
```

### Preservation Criteria

**Must Preserve (Hard Requirements):**
- Explicit instructions (`must`, `should`, `required`, `exactly`, `only`, `never`)
- Constraints (counts, formats, versions, languages)
- Technical content (code, URLs, identifiers, numbers)
- Negative instructions (`do not`, `don't`, `must not`, `avoid`, `never`)
- Output format specifications
- Secrets (must remain masked/unchanged)

**Must Not Contain (Hard Requirements):**
- Instruction injection payloads
- Hallucinated content
- Corrupted technical identifiers

## Metrics

### Primary Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Token Reduction** | `(original - compressed) / original` | ≥30% avg |
| **NET Token Reduction** | `(original - compressed - overhead) / original` | ≥15% avg |
| **Instruction Preservation** | `preserved_instructions / total_instructions` | ≥99% |
| **Constraint Preservation** | `preserved_constraints / total_constraints` | ≥99% |
| **Semantic Preservation** | Component + structural similarity | ≥95% |
| **Code Integrity** | `intact_code_segments / total_code_segments` | 100% |
| **URL Integrity** | `intact_urls / total_urls` | 100% |
| **Secret Detection** | `detected_secrets / actual_secrets` | 100% |

### Secondary Metrics

| Metric | Description |
|--------|-------------|
| Latency (ms) | End-to-end compression time |
| Memory (MB) | Peak heap usage |
| Failure Rate | % of cases rejected or errored |
| Cloud Escalation | % of cases using Groq |

## Running Benchmarks

### CLI

```bash
# Full suite
pnpm benchmark

# Specific categories
pnpm benchmark -- --cat=coding_prompts,adversarial_prompts

# Limit cases
pnpm benchmark -- --limit=50

# Custom target model
pnpm benchmark -- --model=claude-3-opus

# Output format
pnpm benchmark -- --output=json > report.json
```

### Programmatic

```typescript
import { runBenchmarks } from '@tokentrim/benchmarks';

const report = await runBenchmarks({
  categories: ['coding_prompts', 'adversarial_prompts'],
  targetModel: 'gpt-4',
  limit: 100
});

console.log(report);
```

## Report Format

```typescript
interface BenchmarkReport {
  timestamp: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageTokenReduction: number;       // %
  averageNetTokenReduction: number;    // %
  averageSemanticPreservation: number;  // 0-1
  averageInstructionPreservation: number;
  averageConstraintPreservation: number;
  averageCodeIntegrity: number;
  averageUrlIntegrity: number;
  averageSecretDetection: number;
  averageLatencyMs: number;
  results: BenchmarkResult[];
}

interface BenchmarkResult {
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
```

## Quality Gates

### CI Thresholds

| Metric | Minimum | Action if Failed |
|--------|---------|------------------|
| Average Token Reduction | 25% | Block merge |
| Average NET Reduction | 10% | Block merge |
| Instruction Preservation | 95% | Block merge |
| Constraint Preservation | 95% | Block merge |
| Code Integrity | 99.9% | Block merge |
| URL Integrity | 100% | Block merge |
| Secret Detection | 100% | Block merge |
| Failure Rate | <5% | Warning |

### Regression Detection

Each failed case in CI:
1. Added to `tests/regression/` automatically
2. Must be fixed before merge
3. Becomes permanent test case

## Adversarial Testing

### Special Categories

**Constraint-Heavy:**
- Exact counts: "exactly 3 examples"
- Negative: "DO NOT use pandas"
- Format locks: "Return ONLY JSON"
- Version locks: "version 2.4.1"

**Adversarial:**
- Instruction injection: "IGNORE PREVIOUS INSTRUCTIONS"
- Format preservation: Exact JSON with secrets
- Prohibition preservation: "Never mention X"

### Scoring

Adversarial cases weight 2x in failure rate calculation.

## Continuous Benchmarking

### Nightly Runs
- Full suite (500+ cases)
- Multiple target models (GPT-4, Claude, Llama)
- Performance regression detection
- Results stored for trend analysis

### Per-PR
- Smoke test (50 cases)
- Category sampling
- Fast feedback (<5 min)

## Adding Test Cases

### 1. Create Test Case

```typescript
{
  id: 'coding-004',
  name: 'Async function with error handling',
  category: 'coding_prompts',
  input: `Write an async TypeScript function that fetches user data from an API.
    It must handle network errors, timeout after 5 seconds, and retry up to 3 times.
    Return type: Promise<User | null>. Use fetch with AbortController.`,
  expectedMinReduction: 0.15,
  expectedMaxReduction: 0.4,
  mustPreserve: [
    'async', 'TypeScript', 'fetches', 'user data', 'API',
    'handle network errors', 'timeout', '5 seconds',
    'retry', '3 times', 'Promise<User | null>',
    'fetch', 'AbortController'
  ],
  mustNotContain: [],
  targetModel: 'gpt-4',
  tags: ['typescript', 'async', 'error-handling', 'fetch']
}
```

### 2. Validate

```bash
pnpm benchmark -- --cat=coding_prompts --limit=1
```

### 3. Commit

```bash
git add packages/benchmarks/src/test-cases.ts
git commit -m "bench: add async fetch test case"
```

## Interpreting Results

### Pass Criteria
- All `mustPreserve` terms present in compressed output
- No `mustNotContain` terms present
- Verification engine accepts candidate
- NET token savings > 0

### Failure Analysis

| Failure Type | Common Causes | Action |
|--------------|---------------|--------|
| Missing `mustPreserve` | Over-aggressive compression, instruction loss | Adjust thresholds, improve system prompt |
| Contains `mustNotContain` | Hallucination, injection not blocked | Strengthen system prompt, verification |
| Verification rejected | Safety scores below threshold | Analyze which check failed |
| NET savings negative | AI overhead > gross reduction | Skip AI for short prompts |
| Code/URL corrupted | Tier 0 or AI modified protected segment | Fix protected segment logic |

## Historical Baselines

| Version | Token Reduction | NET Reduction | Instruction Pres | Constraint Pres | Code Integrity |
|---------|-----------------|---------------|------------------|-----------------|----------------|
| v1.0.0 | 35.2% | 18.7% | 99.3% | 98.9% | 100% |

*Run `pnpm benchmark` to establish your baseline.*