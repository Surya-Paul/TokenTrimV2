# TokenTrim Security

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  • Input validation & sanitization (Zod schemas)            │
│  • Secret detection & blocking                               │
│  • Verification engine (instruction/constraint/technical)   │
│  • NET savings enforcement                                   │
├─────────────────────────────────────────────────────────────┤
│                    API LAYER                                  │
│  • CORS origin restriction                                   │
│  • Rate limiting (per-IP)                                    │
│  • Request body-size limit                                   │
│  • Pino log redaction (prompt text, auth headers)            │
│  • TypeScript strict mode                                    │
├─────────────────────────────────────────────────────────────┤
│                    RUNTIME LAYER                             │
│  • Server secrets in environment variables only              │
│  • No secrets in the browser bundle                          │
│  • Process-level isolation (API ↔ Web)                       │
├─────────────────────────────────────────────────────────────┤
│                    SUPPLY CHAIN LAYER                        │
│  • pnpm lockfile integrity                                  │
│  • Dependency review in CI                                  │
│  • Security audit (pnpm audit)                              │
│  • TruffleHog secret scanning                               │
└─────────────────────────────────────────────────────────────┘
```

## API Server Security

### CORS

The `CORS_ORIGIN` environment variable controls which browser origins may call the API. In production, set it to your exact web client URL (e.g. `https://tokentrim.example.com`). Wildcard origins are not recommended.

### Rate Limiting

Fastify rate limiting is applied per-IP using `@fastify/rate-limit`. The `RATE_LIMIT_MAX` environment variable sets the maximum requests per minute.

### Request Body Limit

The `REQUEST_SIZE_LIMIT` environment variable (e.g. `1mb`, `500kb`) is parsed at startup and applied to Fastify's `bodyLimit` option. Invalid values cause a startup crash with a clear error message.

### Log Redaction

Pino redacts `req.headers.authorization` and `req.body.text` to prevent prompt text and auth tokens from appearing in logs.

## Secret Management

### API Key Storage

The Groq API key is stored exclusively in the API server's environment variables (`apps/api/.env`):

- **Never** committed to version control (`.env` is in `.gitignore`).
- **Never** sent to the browser or included in the web client bundle.
- **Never** logged (redacted by Pino).

### Secret Detection Pipeline

```typescript
// 1. Scan input
const scan = secretDetector.scan(prompt);

// 2. Block if secrets detected
if (scan.hasSecrets) {
  // Return HTTP 422 — prompt is never sent to Groq
}

// 3. Mask in any logs
const masked = secretDetector.maskSecrets(prompt);
```

**Patterns (15+ categories):**
- OpenAI/GitHub/AWS/API keys: High confidence regex
- JWTs: Structure validation
- Private keys: PEM boundary markers
- Database URLs: Credential extraction
- Generic: Heuristic patterns

**Overlap Resolution:** Highest confidence wins.

## Provider Security

### Groq (Cloud)
```
- API key in Authorization header (never in URL)
- TLS 1.2+ enforced
- Request timeout (configurable via REQUEST_TIMEOUT_MS)
- Exponential backoff retry (max 3)
- Circuit breaker (5 failures → 60s cooldown)
- Rate limit handling (respects Retry-After)
- Auth error detection (401 → permanent fail)
- No request/response logging with sensitive data
```

**Circuit Breaker State Machine:**
```
CLOSED (normal) → 5 failures → OPEN (cooldown)
                    ↑              │
                    │              ▼
                    └──── 60s ──── HALF_OPEN → test request → CLOSED/OPEN
```

## Verification Engine Security

### Instruction Preservation
- Keyword-based detection (`must`, `should`, `never`, `exactly`, etc.)
- Semantic matching for paraphrased instructions
- Negative instruction detection (`do not`, `don't`, `must not`)

### Constraint Preservation
- Pattern extraction for counts, formats, versions, languages
- Fuzzy matching for equivalent constraints
- Violation reporting with evidence

### Technical Integrity
- Byte-for-byte comparison for protected segments
- Corruption classification (modified, removed, truncated, hallucinated)
- Zero tolerance for code/URL/identifier changes

### Semantic Verification
- Component-level semantic matching
- Structural similarity (paragraphs, code blocks)
- Length ratio sanity check

## Dependency Security

### CI Pipeline
```yaml
# Dependency Review
- uses: actions/dependency-review-action@v3
  with:
    config-file: '.github/dependency-review-config.yml'

# Security Audit
- run: pnpm audit --prod

# Secret Scanning
- uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: main
    head: HEAD
```

### Allowed Licenses
- MIT, Apache-2.0, BSD-2/3-Clause, ISC, CC0, Unlicense

### Denied Licenses
- GPL-2.0/3.0, AGPL-3.0, LGPL-2.0/3.0

### Update Policy
- Dependabot for security updates
- Manual review for major versions
- Lockfile committed

## Code Security

### TypeScript Strict Mode
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true
}
```

### Error Handling
- No crashes on provider failures
- Graceful fallback to Tier 0
- Original prompt always preserved as last resort
- Structured error types with recovery hints

### Input Validation
```typescript
// Zod schemas for all external input
const CompressionRequestSchema = z.object({
  text: z.string().max(100_000),
  targetModel: TargetModelSchema,
  compressionTarget: CompressionTargetSchema
});
```

## Threat Modeling

### STRIDE Analysis

| Threat | Mitigation |
|--------|------------|
| **S**poofing | CORS origin restriction, HTTPS for Groq |
| **T**ampering | Verification engine, Zod input validation |
| **R**epudiation | Structured logging, audit trail |
| **I**nformation Disclosure | Secret detection, env-only keys, log redaction |
| **D**enial of Service | Rate limiting, timeouts, circuit breakers, body-size limits |
| **E**levation of Privilege | No server-side eval, TypeScript strict mode |

### Attack Surface

| Vector | Status | Mitigation |
|--------|--------|------------|
| Malicious prompt | ✅ Mitigated | Verification engine, no instruction following |
| Secret exfiltration | ✅ Mitigated | Detection blocks cloud, HTTP 422 returned |
| Prototype pollution | ✅ Mitigated | TypeScript, frozen objects |
| Supply chain | ✅ Mitigated | Lockfile, audit, review |
| Oversized payload | ✅ Mitigated | REQUEST_SIZE_LIMIT enforced |

## Incident Response

### If Secret Leaked to Cloud
1. User notified immediately via HTTP 422 (should not happen; secrets are blocked)
2. Cloud request logged (masked)
3. Groq API key rotation recommended
4. Secret detection patterns updated

### If Verification Bypassed
1. Regression test added
2. Thresholds reviewed
3. Pattern coverage expanded

## Security Checklist

### Pre-Release
- [ ] `pnpm audit --prod` passes
- [ ] `trufflehog` scan clean
- [ ] Dependency review passes
- [ ] All security tests pass
- [ ] `.env` files are in `.gitignore`

### Runtime
- [ ] CORS restricted to exact web client origin
- [ ] Rate limiting enabled
- [ ] Timeouts on all network calls
- [ ] Circuit breakers active
- [ ] Log redaction verified (no prompt text in logs)

### Post-Release
- [ ] Monitor for CVE in dependencies
- [ ] Monitor Groq security advisories
- [ ] User-reported security issues triaged <24h

## Reporting Security Issues

**Email:** security@tokentrim.dev
**PGP Key:** Available on GitHub
**Response Time:** < 48 hours

**Do NOT:**
- Open public GitHub issues for security vulnerabilities
- Include sensitive data in reports

**Include:**
- Description of vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)