# TokenTrim Privacy Model

## Core Principle

**Local processing whenever possible. Cloud processing only when necessary. Never without consent.**

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR MACHINE                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Analyzer │───►│ Tier 0   │───►│ Phi-4    │              │
│  │          │    │ Compress │    │ (Ollama) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                                    │                │
│       ▼                                    ▼                │
│  ┌──────────────────────────────────────────────┐           │
│  │           VERIFICATION ENGINE                 │           │
│  │  Instructions │ Constraints │ Technical       │           │
│  └──────────────────────────────────────────────┘           │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────────────────────────────┐           │
│  │         LOCAL OUTPUT (DEFAULT)                 │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Only if enabled + allowed
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        CLOUD (GROQ)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐   │
│  │  Groq    │───►│ Generate │───►│ Verify & Select Best │   │
│  │  API     │    │ Candidates           │                  │   │
│  └──────────┘    └──────────┘    └──────────────────────┘   │
│                              │                                │
│                              ▼                                │
│  ┌──────────────────────────────────────────────┐           │
│  │         RETURN TO LOCAL MACHINE                │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## What Never Leaves Your Machine

- ✅ Original prompts (unless cloud fallback explicitly used)
- ✅ Compressed results
- ✅ Analytics data (aggregated only)
- ✅ Settings & preferences
- ✅ API keys (stored in OS keychain)
- ✅ Secret scan results

## What Goes to Cloud (Only With Consent)

**Only when ALL of these are true:**
1. Cloud fallback enabled in Settings
2. No secrets detected in prompt
3. Local compression insufficient or failed
4. User confirmed (if confirmation required)

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
Secrets Detected + neverSendSecrets = true  →  BLOCK CLOUD
localOnlyMode = true                        →  BLOCK CLOUD
allowCloudProcessing = false                →  BLOCK CLOUD
```

### Masking in Logs
When `maskSecretsInLogs = true` (default):
```
Original:  "API key: sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234"
Logged:    "API key: sk-ab******34"
```

## API Key Storage

### Groq API Key
- Stored in OS keychain via `keytar`
- **Never** written to settings file
- **Never** sent to renderer process
- **Never** logged

| Platform | Storage |
|----------|---------|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (libsecret) |

### Ollama
- No API key needed
- Local HTTP endpoint only
- Config stored in settings (not secret)

## Settings Privacy

```typescript
interface PrivacySettings {
  neverSendSecrets: true,        // Block cloud if secrets found
  allowCloudProcessing: false,   // Master cloud switch
  requireCloudConfirmation: true,// Prompt before cloud
  maskSecretsInLogs: true,       // Mask in debug logs
  localOnlyMode: false           // Hard disable cloud
}
```

**Defaults:** Maximum privacy. User must explicitly enable cloud.

## Analytics

### Collected (Local Only)
```typescript
{
  totalPrompts: number,
  totalOriginalTokens: number,
  totalOptimizedTokens: number,
  grossTokensSaved: number,
  compressionOverhead: number,
  netTokensSaved: number,
  estimatedMoneySaved: number,
  localCompressionPercentage: number,
  cloudCompressionPercentage: number,
  averageLatencyMs: number,
  failureRate: number,
  cloudEscalationRate: number,
  byProvider: { deterministic, ollama, groq },
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

### Storage
- Local file: `~/Library/Application Support/TokenTrim/telemetry.json` (macOS)
- Encrypted at rest by OS
- User can disable: `Settings → Advanced → Diagnostics`
- User can reset: `Settings → Danger Zone → Clear Analytics Data`

## Network Connections

| Destination | Purpose | When |
|-------------|---------|------|
| `http://localhost:11434` | Ollama API | Local AI enabled |
| `https://api.groq.com` | Groq API | Cloud fallback enabled + allowed |
| `https://github.com` | Update check | Optional, manual |

**No telemetry endpoints. No analytics endpoints. No tracking pixels.**

## Threat Model

### Mitigated
| Threat | Mitigation |
|--------|------------|
| Prompt exfiltration | Local-only default, secret blocking |
| API key theft | OS keychain, never in settings/logs |
| Cloud data retention | Groq doesn't train on API data |
| Injection attacks | Verification engine, no instruction following |
| Supply chain | pnpm lockfile, dependency review CI |
| Electron exploits | Sandbox, context isolation, CSP |

### Residual Risks
| Risk | Likelihood | Impact | Notes |
|------|------------|--------|-------|
| Ollama vulnerability | Low | Medium | Local network only |
| Groq data breach | Low | Low | No PII sent |
| Secret detection false negative | Low | High | Multiple pattern layers |
| Settings file exposure | Low | Medium | No secrets stored |

## Compliance

- **GDPR**: No personal data processed
- **CCPA**: No sale of data, no tracking
- **SOC2**: Local-first aligns with data minimization
- **HIPAA**: No PHI processed (user responsibility)

## User Controls

### In App
- Settings → Privacy: All cloud controls
- Settings → Danger Zone: Clear analytics
- Compression panel: Shows processing mode (LOCAL/CLOUD)

### Via Config
```bash
# Disable all cloud
TOKENTRIM_LOCAL_ONLY=true

# Disable telemetry
TOKENTRIM_TELEMETRY=false

# Custom Ollama endpoint
OLLAMA_BASE_URL=http://custom-host:11434
```

## Audit Checklist

- [ ] No prompt content in logs
- [ ] No API keys in settings file
- [ ] Secret detection blocks cloud
- [ ] Analytics aggregated only
- [ ] No external connections by default
- [ ] Electron security hardened
- [ ] Dependencies reviewed
- [ ] Build reproducible