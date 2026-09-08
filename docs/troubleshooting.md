# Troubleshooting Guide

## Quick Diagnosis

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "Ollama not available" | Ollama not running | `ollama serve` |
| "Model not found" | Phi-4-mini not pulled | `ollama pull phi4-mini` |
| Compression rejected | Safety thresholds too high | Lower in Settings → Advanced |
| No token reduction | Prompt already minimal / Tier 0 only | Enable AI compression |
| Groq errors | Invalid API key / quota | Check key in Settings → Cloud |
| App won't start | Port conflict / corrupt config | Reset settings, check ports |

## Ollama Issues

### Ollama Not Running

```bash
# Start Ollama
ollama serve

# Or as service (macOS)
brew services start ollama

# Windows: Ollama runs as service automatically
```

### Model Not Found

```bash
# List available models
ollama list

# Pull Phi-4-mini
ollama pull phi4-mini

# Pull specific version
ollama pull phi4-mini:latest
```

### Connection Refused

**Check endpoint in Settings:**
- Default: `http://localhost:11434`
- Verify: `curl http://localhost:11434/api/tags`

**Firewall/Antivirus:**
- Allow localhost:11434
- Check Windows Defender / macOS Firewall

### Model Loading Slow

- First load takes 10-30s (model loads into VRAM/RAM)
- Subsequent requests: 100-300ms
- Keep Ollama running for persistent model

### Out of Memory

```bash
# Check GPU memory
ollama ps

# Use smaller model if needed
# Settings → Local AI → Model: phi4-mini (3.8B params)
```

### Wrong Model Version

```bash
# Check what's loaded
ollama ps

# Restart Ollama to reload
ollama serve
# Ctrl+C then restart
```

## Groq Issues

### Invalid API Key

1. Get key from [Groq Console](https://console.groq.com/keys)
2. Paste in Settings → Cloud → API Key
3. Key stored in OS keychain (not settings file)

### Rate Limited (429)

- Groq free tier: 30 RPM, 6000 TPM
- Wait for `Retry-After` header
- App auto-retries with exponential backoff
- Consider upgrading Groq plan

### Quota Exceeded

- Check usage at console.groq.com
- Monthly limits reset on 1st
- Disable cloud fallback if quota exhausted

### Model Not Available

```bash
# List available models
curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
```

**Supported Models:**
- `llama-3.1-8b-instant` (fast, default)
- `llama-3.1-70b-versatile` (smart)
- `mixtral-8x7b-32768` (large context)
- `gemma2-9b-it` (Google)

### Network Errors

- Check internet connection
- Corporate firewall may block api.groq.com
- Proxy: Set `HTTP_PROXY` / `HTTPS_PROXY` env vars

## Compression Issues

### No Reduction Achieved

**Causes:**
- Prompt already minimal (<50 tokens)
- Tier 0 only (AI disabled)
- Prompt is mostly protected content (code/URLs)

**Fixes:**
- Enable Local AI in Settings
- Check `maxCompressionRatio` not too low
- Verify prompt has compressible content

### Compression Rejected

**Check Safety Indicators in UI:**
- Red badge = failed check
- Hover for details

**Common Failures:**
| Check | Fix |
|-------|-----|
| Instruction | Lower `instructionConfidence` threshold |
| Constraint | Lower `technicalIntegrity` threshold |
| Semantic | Lower `semanticConfidence` threshold |
| Technical | Prompt has code/URLs that got modified |

**Quick Fix:** Settings → Advanced → Lower thresholds

### Output Corrupted

**Symptoms:**
- Code syntax broken
- URLs truncated
- JSON invalid
- Variables renamed

**Causes:**
- AI hallucination
- Tier 0 over-aggressive
- Verification missed corruption

**Fixes:**
1. Enable "Preview Mode" in Settings
2. Lower compression target to "Conservative"
3. Report as bug with original + output

### Negative Instructions Lost

**Examples:**
- "Do not use X" → "Use X"
- "Never delete Y" → "Delete Y"
- "Without Z" → "With Z"

**Fix:** This is a critical bug. Report immediately with:
1. Original prompt
2. Compressed output
3. Expected vs actual

## UI Issues

### App Won't Open

**macOS:**
```bash
# Remove quarantine
xattr -cr /Applications/TokenTrim.app

# Or right-click → Open
```

**Windows:**
- Run as Administrator once
- Check antivirus not blocking

**Linux:**
```bash
# Install dependencies
sudo apt install libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

# Run with --no-sandbox if needed (not recommended)
./TokenTrim --no-sandbox
```

### Window Position/Size Wrong

- Delete settings: Settings → Danger Zone → Reset
- Or manually: `~/Library/Application Support/TokenTrim` (macOS)

### Hotkey Not Working

**Check:**
- Settings → General → Global Hotkey
- Conflicts with other apps (Raycast, Alfred, etc.)
- macOS: System Settings → Keyboard → Shortcuts

**Fix:**
- Change hotkey to unused combination
- Restart app after change

### Settings Not Saving

**macOS:**
```bash
# Check permissions
ls -la ~/Library/Application\ Support/TokenTrim/
```

**Fix:**
- Reset settings: Settings → Danger Zone → Reset All Settings
- Re-enter API key (stored in keychain separately)

## Performance Issues

### Slow Compression

| Expected | Actual | Cause |
|----------|--------|-------|
| <10ms | >100ms | Large prompt, no Tier 0 benefit |
| 100-300ms | >5s | Ollama cold start |
| 50-200ms | >10s | Groq rate limit / network |

**Fixes:**
- Keep Ollama running
- Enable Tier 0 (always on)
- Use "Conservative" target for large prompts

### High Memory Usage

- Normal: <100MB for app
- Large prompts: up to 500MB temporary
- Restart app if >1GB

### CPU Spikes

- Ollama using GPU/CPU for inference
- Normal during compression
- Check `ollama ps` for stuck models

## Data Issues

### Lost Settings

**Locations:**
- macOS: `~/Library/Application Support/TokenTrim/settings.json`
- Windows: `%APPDATA%\TokenTrim\settings.json`
- Linux: `~/.config/TokenTrim/settings.json`

**Backup:**
```bash
# Copy settings file
cp ~/Library/Application\ Support/TokenTrim/settings.json ~/settings-backup.json
```

### Analytics Missing

- Check Settings → Advanced → Diagnostics enabled
- Data stored locally only
- Reset: Settings → Danger Zone → Clear Analytics Data

### Clipboard Not Working

- macOS: Grant Accessibility permission
- System Settings → Privacy & Security → Accessibility → TokenTrim
- Windows: Run as Admin once
- Linux: `wl-copy` / `xclip` installed

## Error Messages

### "Provider unavailable"
- Ollama: Check `ollama serve` running
- Groq: Check API key, internet

### "Verification failed"
- Safety scores below threshold
- See Safety Indicators in UI

### "NET savings negative"
- AI overhead > gross reduction
- App returns original prompt

### "Secret detected"
- Cloud blocked
- Check Privacy settings

### "Tokenizer error"
- Target model not supported
- Falls back to generic estimator

## Logs

### Enable Debug Logging

Settings → Advanced → Log Level: `debug`

### Log Locations

- macOS: `~/Library/Logs/TokenTrim/`
- Windows: `%APPDATA%\TokenTrim\logs\`
- Linux: `~/.config/TokenTrim/logs/`

### Common Log Patterns

```
[TokenTrim] Compression started: 1248 tokens
[TokenTrim] Tier 0 candidate: 892 tokens (28% reduction)
[TokenTrim] Phi-4-mini candidate: 756 tokens (39% reduction)
[TokenTrim] Verification passed: semantic=0.97, instruction=1.00
[TokenTrim] Accepted: Phi-4-mini, NET savings=312 tokens
```

## Reporting Bugs

### Before Reporting

1. Update to latest version
2. Check existing issues
3. Try reset settings
4. Note exact steps to reproduce

### Bug Report Template

```markdown
**Version:** 1.0.0
**OS:** macOS 14.5 / Windows 11 / Ubuntu 22.04
**Ollama:** 0.1.47 (if applicable)
**Groq:** Enabled/Disabled

**Steps to Reproduce:**
1. Open TokenTrim
2. Paste: [prompt]
3. Click Optimize
4. Observe: [issue]

**Expected:** [what should happen]
**Actual:** [what happens]

**Safety Indicators:** [screenshot or values]
**Logs:** [relevant log lines]
```

## Reset Everything

### Nuclear Option

```bash
# Stop app
# Delete all data

# macOS
rm -rf ~/Library/Application\ Support/TokenTrim
rm -rf ~/Library/Logs/TokenTrim
rm -rf ~/Library/Caches/TokenTrim

# Windows
Remove-Item -Recurse -Force $env:APPDATA\TokenTrim

# Linux
rm -rf ~/.config/TokenTrim
rm -rf ~/.cache/TokenTrim

# Restart app → fresh install state
```

**Note:** This deletes settings, analytics, and cached data. API key in keychain preserved.

## Getting Help

- **GitHub Issues:** Bug reports, feature requests
- **Discord:** Community support (link in README)
- **Email:** support@tokentrim.dev
- **Docs:** https://tokentrim.dev/docs