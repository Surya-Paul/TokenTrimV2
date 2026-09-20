# TokenTrim Architecture

## System Components

1. **Web Client (`apps/web`)**
   - React 18, Vite, TypeScript
   - Handles user input, settings management (local storage), and presents compression results.
   - Communicates exclusively with the API server via HTTP REST.

2. **API Server (`apps/api`)**
   - Fastify, TypeScript
   - Handles compression pipelines, privacy scanning, and rate limiting.
   - Integrates with Groq for AI-assisted compression.
   - Configures CORS, body-size limits, and request timeouts via environment variables.

3. **Core Engine (`packages/core`)**
   - Orchestrates the compression pipeline: Analysis → Privacy Scan → Tier 0 → Cloud AI (Groq) → Verification.

4. **Analyzer (`packages/analyzer`)**
   - Identifies prompt components, structure, and constraints.

5. **Compressor (`packages/compressor`)**
   - *Tier 0 (Deterministic)*: Fast, rules-based reduction.
   - *AI Compressor*: Provider-agnostic generation of compressed candidates.

6. **Verifier (`packages/verifier`)**
   - Scores candidates on semantic preservation, instruction following, and technical integrity.

7. **Privacy (`packages/privacy`)**
   - Fast regex-based secret detection. Fails fast if secrets are found before sending data to cloud APIs.

8. **Tokenizer (`packages/tokenizer`)**
   - Multi-model token counting and estimation. Supports GPT-4, Claude, Llama, Gemini, and other target models for accurate token-count reporting.

## Data Flow

1. User enters text in Web Client.
2. Web Client sends `POST /api/v1/compressions`.
3. API Server validates input and scans for secrets.
4. If clear, API Server runs Tier 0 compression.
5. If Tier 0 is insufficient, API Server queries Groq for AI compression.
6. Verification engine scores all candidates.
7. Best candidate returned to Web Client.

## Deployment Model

```
┌──────────────┐       HTTPS        ┌───────────────┐       HTTPS        ┌──────────┐
│  Web Client  │  ──────────────►   │  API Server   │  ──────────────►   │  Groq    │
│  (Static)    │                    │  (Fastify)    │                    │  Cloud   │
└──────────────┘                    └───────────────┘                    └──────────┘
  Vercel / S3 / etc.                 Railway / Fly / etc.
```

- The web client is a static build deployed to any CDN or static host.
- The API server runs as a standalone Node.js process.
- `CORS_ORIGIN` on the API must match the web client's deployed origin.
- `VITE_API_URL` on the web client must point to the API server before building.