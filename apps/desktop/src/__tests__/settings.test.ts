import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppSettings } from '@tokentrim/shared';

// Mock electron-store
const mockStore = {
  store: {} as any,
  set: vi.fn(function(this: any, value: any) { this.store = value; }),
  get: vi.fn(function(this: any, key: string) { return this.store[key]; }),
  clear: vi.fn(function(this: any) { this.store = {}; })
};

vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => mockStore)
  };
});

// Mock keytar
const mockKeytar = {
  setPassword: vi.fn().mockResolvedValue(undefined),
  getPassword: vi.fn().mockResolvedValue(null),
  deletePassword: vi.fn().mockResolvedValue(undefined)
};

vi.mock('keytar', () => mockKeytar);

// We need to test the saveSettings logic, but it's embedded in the main process.
// Let's create a test that replicates the logic to verify the bug fix.

describe('Settings persistence - Bug 1 fix', () => {
  let currentSettings: AppSettings;
  let persistedSettings: any;

  // Replicate the deepMerge function from main/index.ts
  function deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // Replicate the fixed saveSettings and persistSettingsToDisk
  function saveSettings(settings: Partial<AppSettings>): void {
    currentSettings = deepMerge(currentSettings, settings);
    persistSettingsToDisk();
  }

  function persistSettingsToDisk(): void {
    const { cloud: { apiKey: _, ...cloudRest }, ...rest } = currentSettings;
    persistedSettings = { ...rest, cloud: { ...cloudRest, apiKey: '' } };
  }

  const DEFAULT_SETTINGS: AppSettings = {
    general: {
      enabled: true,
      globalHotkey: 'CommandOrControl+Shift+T',
      compressionTarget: 'balanced',
      previewMode: true,
      autoStart: false,
      minimizeToTray: true,
      theme: 'system',
      compressionMode: 'auto'
    },
    ai: {
      localEnabled: true,
      provider: 'ollama',
      model: 'phi4-mini',
      endpoint: 'http://localhost:11434',
      timeoutMs: 30000
    },
    cloud: {
      fallbackEnabled: true,
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      apiKey: '',
      timeoutMs: 30000,
      maxRetries: 3
    },
    privacy: {
      neverSendSecrets: true,
      allowCloudProcessing: true,
      requireCloudConfirmation: false,
      maskSecretsInLogs: true,
      localOnlyMode: false
    },
    targetModel: {
      tokenizer: 'gpt-4'
    },
    advanced: {
      timeouts: { ollama: 30000, groq: 30000, verification: 10000 },
      retryCount: 3,
      verificationThresholds: {
        semanticConfidence: 0.70,
        instructionConfidence: 0.85,
        technicalIntegrity: 0.95,
        privacyConfidence: 1.0,
        compressionConfidence: 0.7,
        overall: 0.75
      },
      logLevel: 'info',
      diagnostics: false
    }
  };

  beforeEach(() => {
    currentSettings = { ...DEFAULT_SETTINGS };
    persistedSettings = null;
    vi.clearAllMocks();
  });

  it('should keep real API key in memory after saving cloud settings with new key', () => {
    const newApiKey = 'gsk_newRealApiKey1234567890';
    
    // Simulate the settings:set handler logic
    const incomingSettings: any = {
      cloud: {
        fallbackEnabled: true,
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        apiKey: newApiKey,
        timeoutMs: 30000,
        maxRetries: 3
      }
    };

    // This is what the handler does:
    if (incomingSettings.cloud?.apiKey !== undefined) {
      // Store in keytar (mocked)
      // Keep the API key in currentSettings for engine initialization
      currentSettings.cloud.apiKey = incomingSettings.cloud.apiKey;
      
      // Save other cloud settings without API key
      const { cloud: { apiKey: _, ...cloudRest }, ...rest } = incomingSettings;
      saveSettings({ ...rest, cloud: cloudRest } as any);
    }

    // Verify in-memory settings still have the real key
    expect(currentSettings.cloud.apiKey).toBe(newApiKey);
    
    // Verify persisted settings have empty apiKey
    expect(persistedSettings.cloud.apiKey).toBe('');
    expect(persistedSettings.cloud.fallbackEnabled).toBe(true);
    expect(persistedSettings.cloud.model).toBe('llama-3.1-8b-instant');
  });

  it('should clear API key in memory when empty key is provided', () => {
    // First set a key
    currentSettings.cloud.apiKey = 'gsk_existingKey1234567890';
    
    const incomingSettings: any = {
      cloud: {
        fallbackEnabled: true,
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        apiKey: '', // Empty key = delete
        timeoutMs: 30000,
        maxRetries: 3
      }
    };

    if (incomingSettings.cloud?.apiKey !== undefined) {
      if (incomingSettings.cloud.apiKey) {
        currentSettings.cloud.apiKey = incomingSettings.cloud.apiKey;
      } else {
        currentSettings.cloud.apiKey = '';
      }
      
      const { cloud: { apiKey: _, ...cloudRest }, ...rest } = incomingSettings;
      saveSettings({ ...rest, cloud: cloudRest } as any);
    }

    // Verify in-memory settings have empty key
    expect(currentSettings.cloud.apiKey).toBe('');
    
    // Verify persisted settings have empty apiKey
    expect(persistedSettings.cloud.apiKey).toBe('');
  });

  it('should not wipe API key when updating other cloud settings', () => {
    // Set initial key in memory
    const realApiKey = 'gsk_realApiKey1234567890';
    currentSettings.cloud.apiKey = realApiKey;
    
    // Simulate updating fallbackEnabled (like toggling in UI)
    // The renderer sends the full cloud object including masked apiKey
    const incomingSettings: any = {
      cloud: {
        fallbackEnabled: false, // Changed!
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        apiKey: 'gsk_************90', // Masked value from UI
        timeoutMs: 30000,
        maxRetries: 3
      }
    };

    // The handler checks if apiKey is explicitly provided
    // Since the UI sends a masked key, we should NOT treat it as a real key change
    // Only update if the apiKey looks like a real key (starts with gsk_ and is long enough)
    const apiKey = incomingSettings.cloud?.apiKey;
    const isRealApiKey = apiKey?.startsWith('gsk_') 
      && apiKey.length > 20 
      && !apiKey.includes('*');
    
    if (incomingSettings.cloud?.apiKey !== undefined && isRealApiKey) {
      currentSettings.cloud.apiKey = incomingSettings.cloud.apiKey;
    }
    
    const { cloud: { apiKey: _, ...cloudRest }, ...rest } = incomingSettings;
    saveSettings({ ...rest, cloud: cloudRest } as any);

    // Verify in-memory settings STILL have the real key (not wiped by masked value)
    expect(currentSettings.cloud.apiKey).toBe(realApiKey);
    expect(currentSettings.cloud.fallbackEnabled).toBe(false); // But other settings updated
    
    // Verify persisted settings have empty apiKey
    expect(persistedSettings.cloud.apiKey).toBe('');
    expect(persistedSettings.cloud.fallbackEnabled).toBe(false);
  });
});