#!/bin/bash
# Development setup script for TokenTrim

set -e

echo "🚀 TokenTrim Development Setup"
echo "================================"

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required. Current: $(node --version)"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm@9
fi
echo "✅ pnpm $(pnpm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build all packages
echo "🔨 Building all packages..."
pnpm build:all

# Check if Ollama is available
if command -v ollama &> /dev/null; then
    echo "✅ Ollama found: $(ollama --version)"
    
    # Check if phi4-mini is pulled
    if ollama list | grep -q "phi4-mini"; then
        echo "✅ Phi-4-mini model available"
    else
        echo "⚠️  Phi-4-mini not found. Pulling..."
        ollama pull phi4-mini
    fi
else
    echo "⚠️  Ollama not installed. Install from https://ollama.ai"
    echo "   Then run: ollama pull phi4-mini"
fi

# Run tests
echo "🧪 Running tests..."
pnpm test

# Lint
echo "🔍 Linting..."
pnpm lint

# Typecheck
echo "📝 Type checking..."
pnpm typecheck

echo ""
echo "✅ Development setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start Ollama: ollama serve"
echo "  2. Start dev: pnpm dev"
echo "  3. Open http://localhost:3000 (renderer)"
echo "  4. Electron window will open automatically"
echo ""
echo "Useful commands:"
echo "  pnpm dev              # Start all dev processes"
echo "  pnpm build:all        # Build all packages"
echo "  pnpm test             # Run all tests"
echo "  pnpm benchmark        # Run benchmarks"
echo "  pnpm --filter @tokentrim/desktop package  # Build desktop app"