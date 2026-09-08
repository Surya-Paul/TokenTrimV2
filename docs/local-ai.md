# Local AI Setup (Ollama + Phi-4-mini)

## Overview

TokenTrim uses **Microsoft Phi-4-mini** running locally via **Ollama** for semantic compression. This keeps your data on your machine.

## Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 8 GB | 16 GB+ |
| VRAM | 4 GB | 8 GB+ |
| Disk | 5 GB | 10 GB+ |
| CPU | 4 cores | 8+ cores |
| GPU | Optional (Metal/CUDA) | Apple Silicon / NVIDIA RTX |

**Model Size:** Phi-4-mini ~3.8B parameters, ~2.3 GB quantized

## Installation

### macOS

**Homebrew (Recommended):**
```bash
# Install Ollama
brew install ollama

# Start service
brew services start ollama

# Verify
ollama list
```

**Manual:**
```bash
# Download from https://ollama.ai/download
# Run installer
# Start: ollama serve
```

### Windows

**Winget:**
```powershell
winget install Ollama.Ollama
```

**Manual:**
1. Download from https://ollama.ai/download
2. Run installer
3. Ollama runs as Windows Service automatically

### Linux

**Script:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Manual:**
```bash
# Download binary
curl -L https://ollama.ai/download/ollama-linux-amd64 -o /usr/local/bin/ollama
chmod +x /usr/local/bin/ollama

# Start service
sudo systemctl enable ollama
sudo systemctl start ollama
```

## Model Installation

### Pull Phi-4-mini

```bash
# Default (latest)
ollama pull phi4-mini

# Specific quantization (smaller/faster)
ollama pull phi4-mini:q4_k_m    # 4-bit, ~2.3 GB
ollama pull phi4-mini:q8_0      # 8-bit, ~4.1 GB

# Verify
ollama list
```

**Expected Output:**
```
NAME          ID              SIZE      MODIFIED
phi4-mini     a1b2c3d4e5f6    2.3 GB    2 minutes ago
```

### Verify Installation

```bash
# Test generation
ollama run phi4-mini "Hello, how are you?"

# Should respond with a greeting
```

## Configuration

### Default Settings (Work Out of the Box)

TokenTrim connects to `http://localhost:11434` by default.

### Custom Endpoint

Settings → Local AI → Endpoint:
```
http://localhost:11434          # Default
http://192.168.1.100:11434      # Remote machine
http://custom-host:11434        # Custom hostname
```

### Custom Model

Settings → Local AI → Model:
```
phi4-mini           # Default
phi4-mini:q4_k_m    # 4-bit quantized
phi4-mini:q8_0      # 8-bit quantized
phi3:mini           # Alternative
llama3.2:3b         # Alternative
```

### Timeout

Settings → Local AI → Timeout (ms):
```
30000   # Default (30 seconds)
60000   # For slow hardware
15000   # For fast GPU
```

## Verification

### Health Check

TokenTrim automatically checks Ollama on startup:
- Green badge: Connected, model available
- Yellow badge: Checking...
- Red badge: Disconnected

**Manual Check:**
```bash
# API health
curl http://localhost:11434/api/tags

# Model test
curl -X POST http://localhost:11434/api/generate \
  -d '{"model": "phi4-mini", "prompt": "test", "stream": false}'
```

### In-App Test

1. Open TokenTrim
2. Go to Settings → Local AI
3. Click "Test Connection"
4. Should show "Connected" with model name

## Performance Tuning

### Hardware Acceleration

**Apple Silicon (M1/M2/M3):**
- Automatic Metal acceleration
- Best performance with unified memory
- 8GB+ RAM recommended

**NVIDIA GPU (CUDA):**
```bash
# Verify CUDA
nvidia-smi

# Ollama auto-detects CUDA
# Ensure drivers updated
```

**CPU Only:**
- Works on any x64/ARM64
- Slower: 2-5x vs GPU
- 16GB+ RAM recommended

### Memory Management

**Keep Model Loaded:**
```bash
# Prevent unloading (default in Ollama 0.1.47+)
# Or set keep_alive
curl -X POST http://localhost:11434/api/generate \
  -d '{"model": "phi4-mini", "keep_alive": "24h"}'
```

**Reduce Memory:**
```bash
# Use smaller quantization
ollama pull phi4-mini:q4_k_m  # 2.3 GB vs 4.1 GB
```

### Concurrent Requests

- Ollama handles one request at a time by default
- TokenTrim queues requests
- For high throughput: run multiple Ollama instances on different ports

## Troubleshooting

### "Connection Refused"

```bash
# Check service
ollama serve

# Check port
lsof -i :11434

# Restart
brew services restart ollama  # macOS
systemctl restart ollama      # Linux
```

### "Model Not Found"

```bash
ollama pull phi4-mini
ollama list  # Verify
```

### Slow Response (>10s)

1. First run: Model loading (normal)
2. Check RAM/VRAM usage
3. Try smaller quantization
4. Ensure GPU acceleration working

### Out of Memory

```bash
# Check usage
ollama ps

# Free memory
ollama stop phi4-mini

# Use smaller model
ollama pull phi4-mini:q4_k_m
```

### Version Mismatch

```bash
# Update Ollama
brew upgrade ollama  # macOS
winget upgrade Ollama.Ollama  # Windows

# Re-pull model
ollama pull phi4-mini
```

## Remote Ollama

### LAN Access

1. On server: Edit `/etc/ollama/ollama.env` (Linux) or config
2. Set `OLLAMA_HOST=0.0.0.0`
3. Restart: `systemctl restart ollama`
4. Client: Settings → Endpoint → `http://server-ip:11434`

### Docker

```bash
# Run Ollama in Docker
docker run -d \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  --name ollama \
  ollama/ollama

# Pull model
docker exec ollama ollama pull phi4-mini

# Client connects to localhost:11434
```

### GPU in Docker

```bash
docker run -d \
  --gpus all \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  ollama/ollama:rocm  # AMD
# or
docker run -d \
  --gpus all \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  ollama/ollama:cuda  # NVIDIA
```

## Alternative Models

If Phi-4-mini doesn't work, try:

| Model | Size | Quality | Use Case |
|-------|------|---------|----------|
| `phi3:mini` | 2.3 GB | Good | Faster, smaller |
| `llama3.2:3b` | 2.0 GB | Good | Fast, multilingual |
| `gemma2:2b` | 1.6 GB | Good | Very fast |
| `qwen2.5:3b` | 1.9 GB | Good | Code-heavy |

**To switch:**
1. `ollama pull <model>`
2. Settings → Local AI → Model → Select
3. Test Connection

## Uninstall

```bash
# Remove model
ollama rm phi4-mini

# Remove Ollama (macOS)
brew uninstall ollama
rm -rf ~/.ollama

# Remove Ollama (Windows)
winget uninstall Ollama.Ollama
# Or Apps & Features

# Remove Ollama (Linux)
systemctl stop ollama
systemctl disable ollama
rm /usr/local/bin/ollama
rm -rf /usr/share/ollama ~/.ollama
```

## FAQ

**Q: Does it work offline?**
A: Yes, after model download. No internet needed for compression.

**Q: Can I use multiple models?**
A: Yes, pull multiple and switch in Settings.

**Q: Is my data sent to Microsoft?**
A: No. Phi-4-mini runs locally via Ollama. No telemetry.

**Q: How much VRAM/RAM needed?**
A: ~3 GB for q4_k_m, ~5 GB for q8_0. System needs 4-8 GB overhead.

**Q: Can I use CPU only?**
A: Yes, but 3-5x slower. 16GB+ RAM recommended.

**Q: Does it support Apple Silicon?**
A: Yes, native Metal acceleration. Best performance.

**Q: Can I run Ollama on another machine?**
A: Yes, set Endpoint to remote IP:11434. Enable LAN access on server.

**Q: What if compression is slow?**
A: First run loads model. Keep Ollama running. Use GPU. Try q4_k_m.