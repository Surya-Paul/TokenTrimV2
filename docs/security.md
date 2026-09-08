# TokenTrim Security

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  • Input validation & sanitization                          │
│  • Secret detection & blocking                               │
│  • Verification engine (instruction/constraint/technical)   │
│  • NET savings enforcement                                   │
├─────────────────────────────────────────────────────────────┤
│                    FRAMEWORK LAYER                           │
│  • Electron security (sandbox, context isolation, CSP)      │
│  • Secure IPC (allowlisted channels, sender validation)     │
│  • TypeScript strict mode                                    │
├─────────────────────────────────────────────────────────────┤
│                    RUNTIME LAYER                             │
│  • OS keychain for secrets (keytar)                         │
│  • Process isolation (main vs renderer)                     │
│  • No nodeIntegration in renderer                           │
├─────────────────────────────────────────────────────────────┤
│                    SUPPLY CHAIN LAYER                        │
│  • pnpm lockfile integrity                                  │
│  • Dependency review in CI                                  │
│  • Security audit (pnpm audit)                              │
│  • TruffleHog secret scanning                               │
└─────────────────────────────────────────────────────────────┘
```

## Electron Security

### Main Process Hardening

```typescript
// Security-critical settings
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,      // Isolate renderer from Node.js
  nodeIntegration: false,      // No Node.js in renderer
  sandbox: true,               // Chromium sandbox
  webSecurity: true,           // Same-origin policy
  allowRunningInsecureContent: false,
  experimentalFeatures: false
}

// Navigation prevention
webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});

webContents.on('new-window', (event) => {
  event.preventDefault();
});
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' http://localhost:11434 https://api.groq.com;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
">
```

### Secure IPC

**Preload Script (Allowlist):**
```typescript
const ALLOWED_CHANNELS = {
  invoke: [
    'compress:request',
    'settings:get', 'settings:set', 'settings:reset',
    'analytics:get',
    'benchmark:run',
    'provider:health', 'provider:models',
    'privacy:scan',
    'app:version', 'app:quit',
    'window:minimize', 'window:maximize', 'window:close', 'window:isMaximized'
  ],
  send: ['renderer:ready'],
  on: [
    'compression:complete',
    'navigate',
    'settings:updated',
    'provider:status',
    'log:info', 'log:warn', 'log:error'
  ]
};
```

**Main Process Validation:**
```typescript
ipcMain.handle('compress:request', async (event, payload) => {
  // Validate sender
  if (!event.senderFrame || event.senderFrame.url !== 'file://...') {
    throw new Error('Invalid sender');
  }
  // Validate payload
  if (!payload || typeof payload.text !== 'string') {
    throw new Error('Invalid payload');
  }
  // Process...
});
```

## Secret Management

### API Key Storage (keytar)

```typescript
// Storing
await keytar.setPassword('TokenTrim', 'groq-api-key', apiKey);

// Retrieving
const apiKey = await keytar.getPassword('TokenTrim', 'groq-api-key');

// Deleting
await keytar.deletePassword('TokenTrim', 'groq-api-key');
```

**Platform Security:**
| Platform | Backend | Encryption |
|----------|---------|------------|
| macOS | Keychain Services | Hardware-backed (Secure Enclave) |
| Windows | Credential Manager | DPAPI (user credentials) |
| Linux | Secret Service | libsecret (gnome-keyring/kwallet) |

### Secret Detection Pipeline

```typescript
// 1. Scan input
const scan = secretDetector.scan(prompt);

// 2. Check policy
const cloudAllowed = secretDetector.canSendToCloud(prompt);

// 3. Block if needed
if (!cloudAllowed.allowed) {
  // Fall back to Tier 0 or return original
}

// 4. Mask in any logs
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

### Ollama (Local)
- No authentication (local only)
- HTTP only (localhost)
- Health check before use
- Timeout enforcement (30s default)

### Groq (Cloud)
```typescript
// Security features
- API key in Authorization header (never in URL)
- TLS 1.2+ enforced
- Request timeout (30s)
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
  text: z.string().max(1_000_000),  // 1MB limit
  options: CompressionOptionsSchema
});
```

## Threat Modeling

### STRIDE Analysis

| Threat | Mitigation |
|--------|------------|
| **S**poofing | IPC sender validation, HTTPS for Groq |
| **T**ampering | Verification engine, readonly settings |
| **R**epudiation | Structured logging, audit trail |
| **I**nformation Disclosure | Secret detection, local-first, keychain |
| **D**enial of Service | Timeouts, circuit breakers, input limits |
| **E**levation of Privilege | Sandbox, no nodeIntegration, context isolation |

### Attack Surface

| Vector | Status | Mitigation |
|--------|--------|------------|
| Malicious prompt | ✅ Mitigated | Verification engine, no instruction following |
| Secret exfiltration | ✅ Mitigated | Detection blocks cloud, local default |
| IPC exploitation | ✅ Mitigated | Allowlisted channels, sender validation |
| Prototype pollution | ✅ Mitigated | TypeScript, frozen objects |
| Supply chain | ✅ Mitigated | Lockfile, audit, review |
| Electron RCE | ✅ Mitigated | Sandbox, CSP, no remote content |

## Incident Response

### If Secret Leaked to Cloud
1. User notified immediately
2. Cloud request logged (masked)
3. Groq API key rotation recommended
4. Secret detection patterns updated

### If Verification Bypassed
1. Regression test added
2. Thresholds reviewed
3. Pattern coverage expanded

### If Electron Vulnerability
1. Update Electron immediately
2. Security patch release
3. User notification via auto-update

## Security Checklist

### Pre-Release
- [ ] `pnpm audit --prod` passes
- [ ] `trufflehog` scan clean
- [ ] Dependency review passes
- [ ] All security tests pass
- [ ] Electron version current
- [ ] Build signed & notarized (macOS)
- [ ] Build signed (Windows)

### Runtime
- [ ] CSP headers present
- [ ] Sandbox enabled
- [ ] Context isolation enabled
- [ ] No nodeIntegration
- [ ] IPC allowlist enforced
- [ ] Timeouts on all network calls
- [ ] Circuit breakers active

### Post-Release
- [ ] Monitor for CVE in dependencies
- [ ] Monitor Electron releases
- [ ] Monitor Groq/Ollama security advisories
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