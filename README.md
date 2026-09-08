# TokenTrim

**A model-aware, local-first LLM input optimization engine that reduces input tokens and cost while preserving user intent, instructions, constraints, technical content, and semantic meaning.**

> **SAFE compression is more important than maximum compression.**

## Features

### 🔒 Local-First Privacy
- **Phi-4-mini via Ollama** runs entirely on your machine
- No data leaves your device unless you explicitly enable cloud fallback
- Automatic secret detection blocks API keys, tokens, and credentials from cloud processing
- Keys stored securely in system keychain (keytar)

### 🎯 Smart Compression Pipeline
```
Input → Analyzer → Tier 0 (deterministic) → Phi-4-mini (local) → Verification → Output
                              ↓
                    Groq (cloud fallback, optional)
```

### 🛡️ Safety Guarantees
- **Instruction Preservation**: `must`, `should`, `required`, `exactly`, `only`, `never`, `don't`, `do not`, `without`, `unless` - never removed
- **Constraint Preservation**: Exact counts, formats, technologies, versions, file names - verified
- **Technical Integrity**: Code blocks, URLs, identifiers, numbers, paths - byte-for-byte preserved
- **Semantic Verification**: Multi-layer validation before accepting any compression
- **NET Token Savings**: Accounts for AI compression overhead (input + output tokens)

### 📊 Target-Model-Aware Tokenization
- GPT-4 / GPT-3.5 (exact via tiktoken)
- Claude 3 (Opus, Sonnet, Haiku)
- Gemini Pro / 1.5 Pro
- Llama 3 (70B, 8B)
- Qwen 2.5
- Phi-4-mini
- Generic estimator for others

### ⚡ Performance
- Tier 0: <10ms for most prompts
- Phi-4-mini local: 100-300ms typical
- Groq cloud: 50-200ms typical

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+

### Local AI Setup (Required)

```bash
# Install Ollama
brew install ollama  # macOS
# or download from https://ollama.ai

# Pull Phi-4-mini
ollama pull phi4-mini

# Start Ollama server
ollama serve
```

### Installation

```bash
# Clone and install
git clone https://github.com/tokentrim/tokentrim.git
cd tokentrim
pnpm install

# Development
pnpm dev

# Build
pnpm build:all

# Run desktop app
pnpm --filter @tokentrim/desktop dev
```

### Cloud Fallback (Optional)

Get a free API key from [Groq Console](https://console.groq.com) and add it in Settings → Cloud AI.

## Usage

### Global Hotkey
Press `Cmd+Shift+T` (Mac) / `Ctrl+Shift+T` (Win/Linux) to compress clipboard content.

### Manual Compression
1. Open TokenTrim
2. Paste your prompt in the left panel
3. Select target model (GPT-4, Claude, etc.)
4. Click "Optimize"
5. Copy the compressed result

### Settings
- **General**: Hotkey, compression target, preview mode
- **Local AI**: Ollama endpoint, model, timeout
- **Cloud**: Groq API key, model, fallback settings
- **Privacy**: Secret handling, cloud confirmation, local-only mode
- **Target Model**: Tokenizer for accurate counting
- **Advanced**: Verification thresholds, logging, diagnostics

## Architecture

```
TokenTrim/
├── apps/desktop/           # Electron app (main, renderer, preload)
├── packages/
│   ├── core/               # Main orchestration engine
│   ├── analyzer/           # Input analysis (content type, semantics)
│   ├── compressor/         # Tier 0 + AI compression
│   ├── tokenizer/          # Multi-model tokenizer registry
│   ├── verifier/           # Safety verification engine
│   ├── providers/          # Ollama + Groq providers
│   ├── privacy/            # Secret detection & privacy
│   ├── telemetry/          # Local analytics
│   └── shared/             # Types & utilities
├── tests/                  # Unit, integration, security, regression
├── benchmarks/             # Benchmark framework & test cases
└── docs/                   # Documentation
```

## Compression Pipeline

### 1. Input Analysis
- Content type detection (code, SQL, JSON, Markdown, etc.)
- Semantic component extraction (objectives, instructions, constraints)
- Protected segment identification (code, URLs, secrets, identifiers)
- Complexity assessment

### 2. Tier 0 Deterministic Compression
- Whitespace normalization
- Redundant phrase removal ("please could you" → "")
- List compression ("A, B, and C" → "A, B, C")
- Punctuation normalization
- Filler word removal (basically, actually, literally)
- Abbreviations (for example → e.g., that is → i.e.)
- **Zero AI overhead**, **zero privacy risk**

### 3. AI Semantic Compression (Phi-4-mini / Groq)
- Candidate generation (minimal, moderate, aggressive)
- System prompt enforces preservation rules
- Never answers the prompt - only compresses

### 4. Verification Engine
- Instruction preservation check
- Constraint preservation check
- Technical integrity verification
- Semantic similarity scoring
- Privacy compliance check

### 5. Acceptance Decision
- All safety scores above thresholds
- NET token savings positive
- Best candidate selected (prefers local > cloud, higher savings > lower)

## NET Token Savings Calculation

```
Original Tokens: 1,000
Compressed Tokens: 650
Gross Reduction: 350 (35%)

AI Compression Overhead:
  - Phi-4-mini input: 80 tokens
  - Phi-4-mini output: 120 tokens
  Total Overhead: 200 tokens

NET Savings: 350 - 200 = 150 tokens (15%)
Estimated Cost Savings: $0.0003 (at $2/1M tokens)
```

## Security

### Electron Hardening
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Restrictive CSP
- Secure IPC with allowlisted channels
- Navigation restrictions
- No remote content

### Secret Handling
- Automatic detection of API keys, JWTs, AWS credentials, private keys, DB URLs
- Blocks cloud processing when secrets detected
- Keys stored in OS keychain via keytar
- Never logged, never sent to renderer

## Benchmarking

```bash
# Run benchmark suite
pnpm benchmark

# Run specific categories
pnpm benchmark -- --cat=coding_prompts,adversarial_prompts

# Run with limit
pnpm benchmark -- --limit=50
```

Categories: normal_prompts, coding_prompts, debugging_prompts, long_prompts, sql, json, logs, markdown, mathematics, technical_documentation, creative_prompts, multi_step_instructions, constraint_heavy_prompts, adversarial_prompts

## Development

### Project Structure
```bash
# Add a new package
mkdir packages/new-package
# Create package.json, tsconfig.json, src/index.ts

# Run tests
pnpm test              # All tests
pnpm test:unit         # Unit only
pnpm test:integration  # Integration only
pnpm test:security     # Security tests

# Lint & Typecheck
pnpm lint
pnpm typecheck

# Build all
pnpm build:all
```

### Adding a New Test Case
1. Add to `packages/benchmarks/src/test-cases.ts`
2. Include `mustPreserve` and `mustNotContain` arrays
3. Run `pnpm benchmark` to verify

## Configuration

### Environment Variables
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi4-mini
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
```

### Settings File
Stored in platform-appropriate config directory:
- macOS: `~/Library/Application Support/TokenTrim`
- Windows: `%APPDATA%\TokenTrim`
- Linux: `~/.config/TokenTrim`

## Troubleshooting

### Ollama Not Detected
1. Ensure `ollama serve` is running
2. Check Settings → Local AI → Endpoint matches (default: http://localhost:11434)
3. Verify model: `ollama list` should show `phi4-mini`

### Compression Rejected
- Check Safety Indicators in result panel
- Lower verification thresholds in Advanced settings
- Try "Conservative" compression target

### Groq Errors
- Verify API key in Settings → Cloud
- Check rate limits at console.groq.com
- Ensure model name matches available models

## License

MIT License - see LICENSE file for details.

## Credits

- **Phi-4-mini** by Microsoft Research
- **Ollama** for local model serving
- **Groq** for fast cloud inference
- **Tiktoken** for GPT tokenization
- **Electron** for desktop framework