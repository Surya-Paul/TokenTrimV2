import { AppSettings as SharedAppSettings } from '@tokentrim/shared';

// Re-export for convenience in UI components
export type AppSettings = SharedAppSettings;

export const defaultSettings: AppSettings = {
  general: {
    compressionTarget: 'balanced',
    safeResultMode: true,
    theme: 'system'
  },
  privacy: {
    neverSendSecrets: true,
    maskSecretsInLogs: true
  },
  targetModel: {
    tokenizer: 'gpt-4'
  },
  advanced: {
    timeouts: {
      groq: 60000,
      verification: 10000
    },
    retryCount: 3,
    verificationThresholds: {
      semanticConfidence: 0.85,
      instructionConfidence: 0.9,
      technicalIntegrity: 0.95,
      privacyConfidence: 1.0,
      compressionConfidence: 0.7,
      overall: 0.85
    },
    logLevel: 'info',
    diagnostics: false
  }
};
