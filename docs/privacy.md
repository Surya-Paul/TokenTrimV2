# TokenTrim Privacy Model

## Core Principle

**Server-side processing. Cloud AI only when needed. Secrets never sent.**

## Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     WEB CLIENT (Browser)                      │
│                                                               │
│  ┌──────────┐                           ┌──────────────────┐ │
│  │  User    │ ──── POST /compressions ──►│  Display Result  │ │
│  │  Input   │                           │  (compressed)    │ │
│  └──────────┘                           └──────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTPS
┌──────────────────────────────────────────────────────────────┐
│                     API SERVER (Fastify)                       │
│                                                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ Secret   │───►│ Tier 0   │───►│ Groq AI  │               │
│  │ Scanner  │    │ Compress │    │ Compress │               │
│  └──────────┘    └──────────┘    └──────────┘               │
│       │                               │                      │
│       ▼                               ▼                      │
│  BLOCK if secrets           ┌──────────────────┐             │
│  (HTTP 422)                 │  Verification    │             │
│                             │  Engine          │             │
│                             └──────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

## What the Web Client Handles

- ✅ User input (prompt text)
- ✅ Settings & preferences (local storage)
- ✅ Displaying compression results

## What the Web Client Never Sees

- ❌ API keys (Groq key is server-side only)
- ❌ Internal compression pipeline state
- ❌ Raw secret scan results

## What Goes to the Groq Cloud

**Only when ALL of these are true:**
1. No secrets detected in prompt
2. Tier 0 (deterministic) compression is insufficient
3. `GROQ_API_KEY` is configured on the server

**Data sent to Groq:**
- Compression prompt (system + user)
- No metadata, no analytics, no identifiers

## Secret Detection

### Detected Types
| Type | Examples | Confidence |
|------|----------|------------|
| API Keys | `sk-...`, `ghp_...`, `pk_...` | 95-99% |
| JWTs | `eyJ...` | 90% |
| AWS Credentials | `AKIA...` | 99% |
| Private Keys | `-----BEGIN PRIVATE KEY-----` | 100% |
| OAuth Tokens | `ya29....` | 90% |
| Database URLs | `postgres://user:pass@...` | 90% |
| Generic Secrets | `password="..."` | 60-80% |

### Cloud Blocking
```
Secrets Detected + neverSendSecrets = true  →  HTTP 422 (prompt never leaves server)
```

### Masking in Logs
When `maskSecretsInLogs = true` (default):
```
Original:  "API key: sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234"
Logged:    "API key: sk-ab******34"
```

## API Key Storage

### Groq API Key
- Stored in server environment variables (`apps/api/.env`)
- **Never** committed to version control
- **Never** sent to the browser or included in the web bundle
- **Never** logged (Pino redaction)

## Settings Privacy

```typescript
interface PrivacySettings {
  neverSendSecrets: true,        // Block cloud if secrets found
  maskSecretsInLogs: true,       // Mask in debug logs
}
```

## Analytics

### Collected (Server-Side Only)
```typescript
{
  totalPrompts: number,
  totalOriginalTokens: number,
  totalOptimizedTokens: number,
  grossTokensSaved: number,
  compressionOverhead: number,
  netTokensSaved: number,
  estimatedMoneySaved: number,
  averageLatencyMs: number,
  failureRate: number,
  byProvider: { deterministic, groq },
  byContentType: { prose, code, sql, ... }
}
```

### NOT Collected
- ❌ Prompt content
- ❌ Compressed content
- ❌ IP addresses
- ❌ User identifiers
- ❌ Timestamps of individual operations
- ❌ Error details with context

## Network Connections

| Destination | Purpose | When |
|-------------|---------|------|
| `https://api.groq.com` | Groq API | AI compression requested |

**No telemetry endpoints. No analytics endpoints. No tracking pixels.**

## Threat Model

### Mitigated
| Threat | Mitigation |
|--------|------------|
| Prompt exfiltration | Secret blocking, HTTPS, CORS |
| API key theft | Server env only, log redaction |
| Cloud data retention | Groq doesn't train on API data |
| Injection attacks | Verification engine, no instruction following |
| Supply chain | pnpm lockfile, dependency review CI |

### Residual Risks
| Risk | Likelihood | Impact | Notes |
|------|------------|--------|-------|
| Groq data breach | Low | Low | No PII sent |
| Secret detection false negative | Low | High | Multiple pattern layers |
| Server env file exposure | Low | Medium | File permissions, .gitignore |

## Compliance

- **GDPR**: No personal data processed
- **CCPA**: No sale of data, no tracking
- **SOC2**: Data minimization aligned
- **HIPAA**: No PHI processed (user responsibility)

## Audit Checklist

- [ ] No prompt content in logs
- [ ] No API keys in settings or web bundle
- [ ] Secret detection blocks cloud
- [ ] Analytics aggregated only
- [ ] CORS restricted to exact web client origin
- [ ] `.env` files not committed
- [ ] Dependencies reviewed
- [ ] Build reproducible