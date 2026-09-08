#!/bin/bash
# Benchmark runner script

set -e

CATEGORIES=${1:-"all"}
LIMIT=${2:-0}
MODEL=${3:-"gpt-4"}

echo "🏃 TokenTrim Benchmark Runner"
echo "=============================="
echo "Categories: $CATEGORIES"
echo "Limit: $LIMIT"
echo "Model: $MODEL"
echo ""

# Build benchmarks package
echo "🔨 Building benchmarks..."
pnpm --filter @tokentrim/benchmarks build

# Run benchmarks
echo "🏁 Running benchmarks..."
cd packages/benchmarks

if [ "$CATEGORIES" = "all" ]; then
    ARGS=""
else
    ARGS="--cat=$CATEGORIES"
fi

if [ "$LIMIT" -gt 0 ]; then
    ARGS="$ARGS --limit=$LIMIT"
fi

ARGS="$ARGS --model=$MODEL"

pnpm benchmark -- $ARGS

echo ""
echo "✅ Benchmarks complete!"
echo "Results saved to benchmarks/results/"