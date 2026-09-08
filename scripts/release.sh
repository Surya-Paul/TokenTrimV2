#!/bin/bash
# Release script for TokenTrim

set -e

VERSION_TYPE=${1:-"patch"}  # patch, minor, major

echo "🚀 TokenTrim Release Process"
echo "============================="
echo "Version bump: $VERSION_TYPE"
echo ""

# Check working directory clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Working directory not clean. Commit or stash changes first."
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
pnpm test

# Lint & Typecheck
echo "🔍 Linting & Typechecking..."
pnpm lint
pnpm typecheck

# Build all
echo "🔨 Building all packages..."
pnpm build:all

# Bump version
echo "📦 Bumping version ($VERSION_TYPE)..."
pnpm version $VERSION_TYPE -w

NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Update CHANGELOG (manual step)
echo ""
echo "📝 Please update CHANGELOG.md with release notes for v$NEW_VERSION"
echo "Press Enter when done..."
read

# Commit version bump
git add -A
git commit -m "chore: release v$NEW_VERSION"

# Create tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push
echo ""
echo "📤 Pushing to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Release v$NEW_VERSION prepared!"
echo ""
echo "Next steps:"
echo "  1. GitHub Actions will build and create release"
echo "  2. Verify artifacts at: https://github.com/tokentrim/tokentrim/releases/tag/v$NEW_VERSION"
echo "  3. Publish release notes"
echo "  4. Announce on channels"