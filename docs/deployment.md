# Deployment Guide

## Overview

TokenTrim is distributed as a signed, notarized Electron application for macOS, Windows, and Linux.

## Build Requirements

### macOS
- macOS 13+ (Ventura)
- Xcode Command Line Tools
- Apple Developer Account (for notarization)
- App-Specific Password for notarization

### Windows
- Windows 10/11
- Visual Studio Build Tools
- Code Signing Certificate (EV preferred)

### Linux
- Ubuntu 22.04+ / Debian 12+
- Docker (for AppImage build)

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
jobs:
  build-desktop:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:all
      - run: pnpm --filter @tokentrim/desktop package
      - uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ matrix.os }}
          path: apps/desktop/dist/electron/**
```

## Building Locally

### Prerequisites

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build:all
```

### macOS Build

```bash
# Development build (unsigned)
pnpm --filter @tokentrim/desktop package --mac --dir

# Production build (requires certificates)
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate-password"
export APPLE_ID="developer@apple.com"
export APPLE_ID_PASS="app-specific-password"

pnpm --filter @tokentrim/desktop package --mac
```

**Output:** `apps/desktop/dist/electron/TokenTrim-1.0.0-arm64.dmg`

### Windows Build

```bash
# Development build (unsigned)
pnpm --filter @tokentrim/desktop package --win --dir

# Production build
export CSC_LINK="path/to/certificate.pfx"
export CSC_KEY_PASSWORD="certificate-password"

pnpm --filter @tokentrim/desktop package --win
```

**Output:** `apps/desktop/dist/electron/TokenTrim Setup 1.0.0.exe`

### Linux Build

```bash
# AppImage (recommended)
pnpm --filter @tokentrim/desktop package --linux AppImage

# Deb package
pnpm --filter @tokentrim/desktop package --linux deb

# RPM package
pnpm --filter @tokentrim/desktop package --linux rpm
```

**Output:** `apps/desktop/dist/electron/TokenTrim-1.0.0.AppImage`

## Code Signing

### macOS

**Requirements:**
- Developer ID Application certificate
- Developer ID Installer certificate (for pkg)
- App-Specific Password for notarization

**Environment Variables:**
```bash
export CSC_LINK="base64-encoded-p12"  # Or file path
export CSC_KEY_PASSWORD="password"
export APPLE_ID="team@example.com"
export APPLE_ID_PASS="app-specific-password"
```

**Notarization (Automatic):**
- `electron-builder` handles notarization
- Staples ticket to DMG
- Verifies on install

### Windows

**Requirements:**
- EV Code Signing Certificate (preferred) or Standard
- `.pfx` file with private key
- Timestamp server (automatic)

**Environment Variables:**
```bash
export CSC_LINK="base64-encoded-pfx"  # Or file path
export CSC_KEY_PASSWORD="password"
```

**SmartScreen:**
- EV certificate = immediate reputation
- Standard certificate = builds reputation over time

### Linux

**No code signing required for AppImage.**
- Optional: GPG sign AppImage
- `electron-builder` supports `--linux.gpgSign`

## Distribution

### GitHub Releases

**Automatic via CI:**
1. Tag release: `git tag v1.0.0 && git push origin v1.0.0`
2. CI builds all platforms
3. Artifacts attached to GitHub Release
4. Release notes from CHANGELOG

**Manual:**
```bash
# Create release
gh release create v1.0.0 \
  apps/desktop/dist/electron/*.dmg \
  apps/desktop/dist/electron/*.exe \
  apps/desktop/dist/electron/*.AppImage \
  --title "TokenTrim v1.0.0" \
  --notes-file CHANGELOG.md
```

### Auto-Updater

**Configuration (in main process):**
```typescript
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'tokentrim',
  repo: 'tokentrim',
  private: false
});

autoUpdater.checkForUpdatesAndNotify();
```

**User Experience:**
- Background check on startup
- Notification when update available
- One-click install and restart
- Silent background download

### Alternative Distribution

**Homebrew (macOS):**
```ruby
# Formula: tokentrim.rb
class Tokentrim < Formula
  desc "LLM input optimization engine"
  homepage "https://tokentrim.dev"
  url "https://github.com/tokentrim/tokentrim/releases/download/v1.0.0/TokenTrim-1.0.0-arm64.dmg"
  sha256 "..."
  
  def install
    prefix.install "TokenTrim.app"
  end
end
```

**Scoop (Windows):**
```json
// bucket/tokentrim.json
{
  "version": "1.0.0",
  "description": "LLM input optimization engine",
  "homepage": "https://tokentrim.dev",
  "license": "MIT",
  "architecture": {
    "64bit": {
      "url": "https://github.com/tokentrim/tokentrim/releases/download/v1.0.0/TokenTrim-Setup-1.0.0.exe",
      "hash": "..."
    }
  },
  "installer": {
    "script": [
      "Expand-7zipArchive \"$dir\\TokenTrim-Setup-1.0.0.exe\" \"$dir\"",
      "Move-Item \"$dir\\TokenTrim-Setup-1.0.0\" \"$dir\\TokenTrim\""
    ]
  },
  "shortcuts": [
    ["TokenTrim.exe", "TokenTrim"]
  ]
}
```

**Flatpak (Linux):**
```yaml
# org.tokentrim.TokenTrim.yml
flatpak-builder --repo=repo build-dir org.tokentrim.TokenTrim.yml
```

## Versioning

### Semantic Versioning

```
MAJOR.MINOR.PATCH
1.0.0
```

| Change | Version Bump |
|--------|--------------|
| Bug fix | PATCH (1.0.1) |
| New feature | MINOR (1.1.0) |
| Breaking change | MAJOR (2.0.0) |

### Release Checklist

- [ ] All tests pass
- [ ] CHANGELOG updated
- [ ] Version bumped in `package.json`
- [ ] Git tag created
- [ ] CI builds successful
- [ ] Artifacts verified
- [ ] Release notes written
- [ ] Auto-updater tested
- [ ] Announcement prepared

## Post-Release

### Monitoring

- GitHub Release downloads
- Auto-updater check-in rate
- Error reports (Sentry/crashpad)
- User feedback channels

### Rollback Procedure

```bash
# If critical bug found
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1

# Delete GitHub Release
gh release delete v1.0.1

# Re-release previous version
git tag v1.0.0
git push origin v1.0.0
```

### Hotfix Process

```bash
# Create hotfix branch
git checkout -b hotfix/1.0.1 main

# Fix bug
# Update CHANGELOG
# Bump version
pnpm version patch

# Merge and release
git checkout main
git merge hotfix/1.0.1
git push origin main --tags
```

## Enterprise Deployment

### Configuration Management

**Pre-configured Settings:**
```json
// Deploy via MDM/Intune/GPO
{
  "general": { "enabled": true, "autoStart": true },
  "ai": { "localEnabled": true, "model": "phi4-mini" },
  "privacy": { "neverSendSecrets": true, "localOnlyMode": true },
  "targetModel": { "tokenizer": "gpt-4" }
}
```

**Deploy Locations:**
- macOS: `~/Library/Application Support/TokenTrim/settings.json`
- Windows: `%APPDATA%\TokenTrim\settings.json`
- Linux: `~/.config/TokenTrim/settings.json`

### Offline Installation

1. Download all artifacts
2. Install Ollama separately
3. Configure settings via script
4. Distribute via internal software catalog

### License Compliance

- MIT License: Permissive commercial use
- No runtime license checks
- Attribution in About panel

## Security Considerations

### Build Integrity

- Reproducible builds (pnpm lockfile)
- CI builds from clean checkout
- Artifact hashes published
- SBOM generated (`pnpm sbom`)

### Supply Chain

- Dependency review in CI
- `pnpm audit` on every build
- No `npm install` in Docker (use `pnpm install --frozen-lockfile`)

### Runtime

- Electron auto-updater verifies signatures
- No unsigned code execution
- CSP prevents XSS
- Sandbox prevents system access

## Troubleshooting Builds

### macOS Notarization Fails

```bash
# Check certificate
security find-identity -v -p codesigning

# Test sign
codesign --verify --deep --strict /path/to/TokenTrim.app

# Check notarization log
xcrun notarytool log <submission-id> --apple-id $APPLE_ID --password $APPLE_ID_PASS --team-id $TEAM_ID
```

### Windows Sign Fails

```bash
# Verify certificate
signtool verify /pa /v TokenTrim.exe

# Check timestamp
signtool verify /pa /v /tr http://timestamp.digicert.com TokenTrim.exe
```

### Linux AppImage Fails

```bash
# Check FUSE
fusermount --version

# Test AppImage
./TokenTrim-1.0.0.AppImage --appimage-extract
```

## Resources

- [electron-builder Config](https://www.electron.build/configuration/configuration)
- [macOS Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [AppImage Guide](https://docs.appimage.org/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)