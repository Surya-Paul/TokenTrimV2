# Groq Cloud Setup

## Overview

Groq provides ultra-fast cloud inference as a fallback when local compression isn't sufficient. TokenTrim only uses Groq when:
1. Cloud fallback enabled in Settings
2. No secrets detected in prompt
3. Local compression insufficient or failed
4. User confirmed (if confirmation required)

## Getting an API Key

1. Go to [Groq Console](https://console.groq.com/keys)
2. Sign up / log in
3. Click "Create API Key"
3. Copy the key (starts with `gsk_`)
4. Paste in TokenTrim Settings → Cloud → API Key

**Key Format:** `gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

## Configuration

### Settings → Cloud

| Setting | Default | Description |
|---------|---------|-------------|
| Fallback Enabled | Off | Master switch for cloud |
| Model | llama-3.1-8b-instant | Groq model to use |
| API Key | (empty) | Your Groq API key |
| Timeout | 30000 ms | Request timeout |
| Max Retries | 3 | Retry attempts |
| Retry Delay | 1000 ms | Base delay for backoff |

### Model Options

| Model | Speed | Quality | Context | Best For |
|-------|-------|---------|---------|----------|
| `llama-3.1-8b-instant` | ⚡⚡⚡ Fastest | Good | 8K | Quick compression |
| `llama-3.1-70b-versatile` | ⚡⚡ Fast | Best | 8K | Complex prompts |
| `mixtral-8x7b-32768` | ⚡ Fast | Good | 32K | Long prompts |
| `gemma2-9b-it` | ⚡⚡ Fast | Good | 8K | Balanced |

**Recommendation:** Start with `llama-3.1-8b-instant` for speed.

## API Key Storage

### Security

- **Never** stored in settings file
- **Never** sent to renderer process
- **Never** logged
- Stored in OS keychain via `keytar`

| Platform | Backend |
|----------|---------|
| macOS | Keychain Services |
| Windows | Credential Manager (DPAPI) |
| Linux | Secret Service (libsecret) |

### Managing Keys

**Update Key:**
1. Settings → Cloud → API Key
2. Enter new key
2. Click "Save Key"
3. Connection tested automatically

**Remove Key:**
1. Settings → Cloud → API Key
2. Clear field
3. Click "Save Key"
4. Cloud fallback disabled automatically

**View/Backup:**
- Keys not viewable in UI
- Use OS keychain tools if needed
- Rotate keys periodically at console.groq.com

## Usage & Limits

### Free Tier (as of 2024)

| Limit | Value |
|-------|-------|
| Requests/minute | 30 |
| Tokens/minute | 6,000 |
| Requests/day | 14,400 |
| Tokens/day | 500,000 |

### Rate Limit Handling

TokenTrim automatically:
1. Respects `Retry-After` header
2. Exponential backoff (1s, 2s, 4s, 8s...)
3. Circuit breaker after 5 failures (60s cooldown)
4. Falls back to local Tier 0 result

### Monitoring Usage

```bash
# Check via Groq Console
https://console.groq.com/usage

# Or API
curl -H "Authorization: Bearer $GROQ_API_KEY" \
  https://api.groq.com/openai/v1/usage
```

## Cost Estimation

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| llama-3.1-8b-instant | $0.05 | $0.08 |
| llama-3.1-70b-versatile | $0.59 | $0.79 |
| mixtral-8x7b-32768 | $0.24 | $0.24 |
| gemma2-9b-it | $0.15 | $0.15 |

**TokenTrim Calculation:**
```
NET Savings = Gross Reduction - (AI Input + AI Output)
Cost Savings = NET Savings × Model Price / 1,000,000
```

**Example:**
- Original: 1,000 tokens
- Compressed: 650 tokens
- Gross: 350 tokens
- AI Overhead: 200 tokens
- NET: 150 tokens
- Cost: 150 × $0.05/1M = $0.0000075

## Privacy

### What Goes to Groq

**Only when ALL conditions met:**
- ✅ Cloud fallback enabled
- ✅ No secrets detected
- ✅ Local insufficient
- ✅ User confirmed (if required)

**Data Sent:**
- Compression system prompt
- User prompt (to compress)
- No metadata, analytics, or identifiers

### What NEVER Goes to Groq

- ❌ API keys, passwords, tokens
- ❌ Database URLs, private keys
- ❌ Analytics data
- ❌ Settings (except model name)
- ❌ Any data when `localOnlyMode = true`

### Secret Blocking

```typescript
// Automatic check before cloud
const scan = secretDetector.scan(prompt);
if (scan.hasSecrets && settings.neverSendSecrets) {
  // BLOCK: Use local result or return original
}
```

## Troubleshooting

### "Invalid API Key"

1. Verify key at console.groq.com
2. Check for extra spaces/newlines
3. Regenerate key if needed
4. Ensure key starts with `gsk_`

### "Rate Limited" (429)

- Wait for `Retry-After` seconds
- Reduce compression frequency
- Upgrade Groq plan for higher limits
- Disable cloud fallback temporarily

### "Quota Exceeded"

- Check monthly usage at console.groq.com
- Limits reset 1st of each month
- Upgrade plan or wait for reset

### "Model Not Available"

```bash
# List available models
curl -H "Authorization: Bearer $GROQ_API_KEY" \
  https://api.groq.com/openai/v1/models
```

### Network Errors

- Check internet connection
- Corporate firewall may block `api.groq.com`
- Proxy: Set `HTTPS_PROXY` env var
- DNS: Try `8.8.8.8` or `1.1.1.1`

### Slow Response

- Normal: 50-200ms
- Slow: >5s (rate limit, cold start)
- Timeout: >30s (increase in Settings)

## Advanced

### Custom Base URL

For proxy/enterprise:
```
Settings → Cloud → Base URL (optional)
Default: https://api.groq.com/openai/v1
```

### Multiple Keys

- Only one key at a time
- Rotate by updating in Settings
- Use different keys per environment

### Enterprise

- Dedicated endpoints available
- Higher limits
- SLA guarantees
- Contact Groq sales

## Testing

### In-App Test

1. Settings → Cloud
2. Enter API Key
3. Click "Test Connection"
4. Should show "Connected" + model list

### Manual Test

```bash
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 10
  }'
```

## Disabling Cloud

### Temporary

Settings → Cloud → Fallback Enabled: **Off**

### Permanent (Local Only)

Settings → Privacy → Local Only Mode: **On**

This completely disables all cloud features.

## FAQ

**Q: Is Groq required?**
A: No. TokenTrim works fully locally with Ollama + Phi-4-mini.

**Q: Does Groq train on my data?**
A: No. Groq doesn't train on API data per their policy.

**Q: Can I use other providers?**
A: Currently only Groq. Architecture supports adding more.

**Q: What if Groq is down?**
A: TokenTrim falls back to local Tier 0 result automatically.

**Q: How much does it cost?**
A: Free tier generous for personal use. ~$0.00001 per compression.

**Q: Can I use my own Groq account?**
A: Yes, enter your API key in Settings.

**Q: Does it work in China?**
A: May need VPN for api.groq.com. Local Ollama works fully.

**Q: Can I set spending limits?**
A: In Groq Console → Billing → Set budget alerts.