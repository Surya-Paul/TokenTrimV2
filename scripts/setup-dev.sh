#!/bin/bash
# Development setup script for TokenTrim (Web + API)

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

# Copy env files if they don't exist
if [ ! -f apps/api/.env ]; then
    echo "📋 Copying apps/api/.env.example → apps/api/.env"
    cp apps/api/.env.example apps/api/.env
    echo "   ⚠️  Set your GROQ_API_KEY in apps/api/.env"
fi

if [ ! -f apps/web/.env ]; then
    echo "📋 Copying apps/web/.env.example → apps/web/.env"
    cp apps/web/.env.example apps/web/.env
fi

# Build all packages
echo "🔨 Building all packages..."
pnpm build

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
echo "  1. Set your GROQ_API_KEY in apps/api/.env"
echo "  2. Start dev: pnpm dev"
echo "     → API server: http://localhost:3001"
echo "     → Web client: http://localhost:5173"
echo ""
echo "Useful commands:"
echo "  pnpm dev              # Start API + Web dev servers"
echo "  pnpm build            # Build all packages"
echo "  pnpm test             # Run all tests"
echo "  pnpm typecheck        # Check types across workspace"
echo "  pnpm lint             # Lint all packages"