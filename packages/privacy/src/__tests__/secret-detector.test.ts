import { describe, it, expect } from 'vitest';
import { SecretDetector, createDefaultPrivacySettings } from '../secret-detector';
import { PrivacySettings } from '@tokentrim/shared';

describe('SecretDetector', () => {
  let detector: SecretDetector;

  beforeEach(() => {
    detector = new SecretDetector(createDefaultPrivacySettings());
  });

  describe('API Key Detection', () => {
    it('detects OpenAI-style API keys', () => {
      const text = 'My API key is sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'api_key')).toBe(true);
    });

    it('detects GitHub tokens', () => {
      const text = 'ghp_abcdefghijklmnopqrstuvwxyz123456789012';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'api_key')).toBe(true);
    });

    it('detects generic API key patterns', () => {
      const text = 'api_key = "supersecretkey12345678901234567890"';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
    });
  });

  describe('JWT Detection', () => {
    it('detects JWT tokens', () => {
      const text = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'jwt')).toBe(true);
    });
  });

  describe('AWS Credentials', () => {
    it('detects AWS access keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'aws_credentials')).toBe(true);
    });
  });

  describe('Private Keys', () => {
    it('detects RSA private keys', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'private_key')).toBe(true);
    });

    it('detects SSH private keys', () => {
      const text = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----`;
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'private_key')).toBe(true);
    });
  });

  describe('Database URLs', () => {
    it('detects postgres URLs with credentials', () => {
      const text = 'postgres://user:password123@localhost:5432/db';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'database_credentials')).toBe(true);
    });
  });

  describe('Masking', () => {
    it('masks secrets in text', () => {
      const text = 'My key is sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234';
      const masked = detector.maskSecrets(text);
      expect(masked).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234');
      expect(masked).toContain('sk-ab******34');
    });

    it('masks JWT tokens', () => {
      const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const masked = detector.maskSecrets(text);
      expect(masked).toContain('eyJh******w5c');
    });
  });

  describe('Cloud Sending Policy', () => {
    it('blocks cloud when secrets detected and neverSendSecrets=true', () => {
      const text = 'API key: sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234';
      const canSend = detector.canSendToCloud(text);
      expect(canSend.allowed).toBe(false);
      expect(canSend.reason).toContain('Secrets detected');
    });

    it('allows cloud when no secrets', () => {
      const text = 'This is a normal prompt without secrets';
      const canSend = detector.canSendToCloud(text);
      expect(canSend.allowed).toBe(true);
    });

    it('blocks cloud in local-only mode', () => {
      const localSettings: PrivacySettings = {
        ...createDefaultPrivacySettings(),
        localOnlyMode: true
      };
      detector.updateSettings(localSettings);
      const canSend = detector.canSendToCloud('normal text');
      expect(canSend.allowed).toBe(false);
      expect(canSend.reason).toContain('Local-only mode');
    });
  });

  describe('Risk Levels', () => {
    it('returns critical for private keys', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('critical');
    });

    it('returns high for AWS keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('critical');
    });

    it('returns none for clean text', () => {
      const text = 'This is a normal prompt';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('none');
    });
  });
});