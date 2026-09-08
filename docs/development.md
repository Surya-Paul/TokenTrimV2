# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Git
- Ollama (for local AI testing)

## Getting Started

```bash
# Clone
git clone https://github.com/tokentrim/tokentrim.git
cd tokentrim

# Install dependencies
pnpm install

# Build all packages
pnpm build:all

# Start development
pnpm dev
```

## Project Structure

```
TokenTrim/
├── apps/
│   └── desktop/              # Electron app
│       ├── src/
│       │   ├── main/         # Main process
│       │   ├── renderer/     # React UI
│       │   └── preload/      # Secure IPC bridge
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── packages/
│   ├── core/                 # Orchestration engine
│   ├── analyzer/             # Input analysis
│   ├── compressor/           # Tier 0 + AI compression
│   ├── tokenizer/            # Multi-model tokenization
│   ├── verifier/             # Safety verification
│   ├── providers/            # Ollama + Groq
│   ├── privacy/              # Secret detection
│   ├── telemetry/            # Local analytics
│   └── shared/               # Types & utilities
│
├── tests/                    # Test suites
│   ├── unit/
│   ├── integration/
│   ├── regression/
│   ├── security/
│   └── benchmarks/
│
├── docs/                     # Documentation
├── scripts/                  # Build/deploy scripts
└── .github/workflows/        # CI/CD
```

## Package Development

### Creating a New Package

```bash
mkdir -p packages/new-package/src
```

**package.json:**
```json
{
  "name": "@tokentrim/new-package",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tokentrim/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0",
    "eslint": "^8.57.0"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Adding Dependencies

```bash
# Add to package
pnpm add @tokentrim/analyzer --filter @tokentrim/new-package

# Add dev dependency
pnpm add -D vitest --filter @tokentrim/new-package
```

## TypeScript Guidelines

### Strict Mode Requirements

All packages use strict TypeScript:
- `noUncheckedIndexedAccess`: Handle undefined array/object access
- `noImplicitOverride`: Explicit override keyword
- `noPropertyAccessFromIndexSignature`: Use typed accessors

### Patterns

**Result Type for Error Handling:**
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<E>(error: E): Result<never, E> { return { ok: false, error }; }
```

**Zod for Runtime Validation:**
```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  timeout: z.number().positive(),
  retries: z.number().int().min(0).max(10)
});

type Config = z.infer<typeof ConfigSchema>;
```

**Interfaces over Types:**
```typescript
// Prefer interface for extensibility
interface ProviderConfig {
  timeout: number;
  retries: number;
}

// Type for unions/computed
type ProviderStatus = 'available' | 'unavailable' | 'loading';
```

## Testing

### Test Organization

```
tests/
├── unit/               # Pure function tests
├── integration/        # Cross-package tests
├── regression/         # Bug regression tests
├── security/           # Security property tests
└── benchmarks/         # Performance benchmarks
```

### Writing Unit Tests

```typescript
// packages/analyzer/src/__tests__/analyzer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InputAnalyzer } from '../analyzer';

describe('InputAnalyzer', () => {
  let analyzer: InputAnalyzer;

  beforeEach(() => {
    analyzer = new InputAnalyzer('gpt-4');
  });

  it('detects code content type', async () => {
    const text = 'function foo() { return 1; }';
    const result = await analyzer.analyze(text);
    expect(result.contentType).toBe('code');
  });
});
```

### Running Tests

```bash
# All tests
pnpm test

# Unit only
pnpm test:unit

# Integration
pnpm test:integration

# Security
pnpm test:security

# Watch mode
pnpm test:watch

# Coverage
pnpm test -- --coverage
```

### Regression Tests

Every bug fix requires a regression test:

```typescript
// tests/regression/issue-123-negative-instruction.test.ts
import { describe, it, expect } from 'vitest';
import { TokenTrimEngine } from '@tokentrim/core';

describe('Regression: Issue #123', () => {
  it('preserves "do not" instructions', async () => {
    const engine = new TokenTrimEngine({ targetModel: 'gpt-4' });
    const input = 'Do not modify the authentication logic.';
    const result = await engine.compress(input, { targetModel: 'gpt-4' });
    
    expect(result.accepted).toBe(true);
    expect(result.bestCandidate?.compressedText).toContain('Do not');
    expect(result.bestCandidate?.compressedText).toContain('authentication');
  });
});
```

## Code Style

### ESLint Config

```json
{
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### Formatting

- 2 spaces indentation
- Single quotes
- Trailing commas (ES5)
- Semicolons required
- Max line length: 100

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `TokenTrimEngine` |
| Interfaces | PascalCase | `CompressionResult` |
| Types | PascalCase | `ProviderStatus` |
| Functions | camelCase | `compressPrompt` |
| Variables | camelCase | `originalTokens` |
| Constants | UPPER_SNAKE | `DEFAULT_THRESHOLDS` |
| Enums | PascalCase | `ContentType` |
| Files | kebab-case | `tier0-compressor.ts` |

## Git Workflow

### Branching

```
main ← develop ← feature/xyz
              ← fix/abc
              ← docs/readme
```

### Commits

```
type(scope): description

feat(analyzer): add SQL content type detection
fix(compressor): preserve negative instructions in Tier 0
docs(readme): update quick start guide
test(verifier): add constraint preservation tests
refactor(core): simplify pipeline orchestration
perf(tokenizer): cache encoder instances
```

### PR Requirements

- [ ] All tests pass
- [ ] Lint & typecheck pass
- [ ] No console.log in production code
- [ ] New features have tests
- [ ] Bug fixes have regression tests
- [ ] Documentation updated
- [ ] CHANGELOG entry (for releases)

## Debugging

### Main Process

```bash
# DevTools opens automatically in development
# Or attach via:
# Chrome → chrome://inspect → Open dedicated DevTools for Node
```

### Renderer Process

```bash
# React DevTools available
# Network tab shows IPC calls
```

### VS Code Debug Config

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Main",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
  "runtimeArgs": ["${workspaceFolder}/apps/desktop/dist/main/index.js"],
  "cwd": "${workspaceFolder}/apps/desktop"
}
```

## Common Tasks

### Add New Content Type

1. Add to `ContentType` enum in `@tokentrim/shared`
2. Add patterns in `@tokentrim/analyzer/src/analyzer.ts`
3. Add test cases in `@tokentrim/analyzer/src/__tests__/analyzer.test.ts`
4. Add benchmark cases if needed

### Add New Provider

1. Implement `LLMProvider` in `@tokentrim/providers`
2. Add to `ProviderFactory`
3. Add config type
4. Update settings UI
5. Add health check endpoint

### Add New Verification Check

1. Add to `SafetyCheckType` enum
2. Implement in `VerificationEngine.verify()`
3. Add threshold to `VerificationThresholds`
4. Update settings UI

### Update Tokenizer

1. Add model to `TargetModel` enum
2. Add tokenizer implementation or estimator
3. Register in `TokenizerRegistry`
4. Update target model settings

## Performance Profiling

```bash
# Profile main process
node --inspect apps/desktop/dist/main/index.js

# Profile renderer
# Chrome DevTools → Performance tab

# Benchmark specific function
import { performance } from 'perf_hooks';
const start = performance.now();
// ... code
console.log(`Elapsed: ${performance.now() - start}ms`);
```

## Release Process

### Version Bump

```bash
# Patch (bug fixes)
pnpm version patch

# Minor (new features)
pnpm version minor

# Major (breaking changes)
pnpm version major
```

### Build Release

```bash
# Build all
pnpm build:all

# Package desktop
pnpm --filter @tokentrim/desktop package
```

### Publish

```bash
# GitHub Release created automatically by CI
# Artifacts uploaded to release
```

## Troubleshooting

### Build Failures

```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build:all
```

### Type Errors

```bash
# Check types
pnpm typecheck

# Fix common issues:
# - Missing imports
# - Type mismatches
# - Strict null checks
```

### Test Failures

```bash
# Run specific test
pnpm test -- --run packages/analyzer/src/__tests__/analyzer.test.ts

# Debug test
pnpm test -- --inspect-brk
```

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Vitest Guide](https://vitest.dev/guide/)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Zod Validation](https://zod.dev/)