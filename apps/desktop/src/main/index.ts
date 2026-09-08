import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, nativeImage, Tray, Menu, screen } from 'electron';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import Store from 'electron-store';
import * as keytar from 'keytar';
import { TokenTrimEngine, TokenTrimEngineConfig } from '@tokentrim/core';
import { AppSettings, CompressionRequest, CompressionResponse, BenchmarkRunOptions, ProviderType, SecretDetectionResult, AnalyticsData, TargetModel } from '@tokentrim/shared';
import { createDefaultPrivacySettings } from '@tokentrim/privacy';

const SERVICE_NAME = 'TokenTrim';
const SETTINGS_KEY = 'app-settings';

interface StoredSettings extends AppSettings {
  version: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    enabled: true,
    globalHotkey: 'CommandOrControl+Shift+T',
    compressionTarget: 'balanced',
    previewMode: true,
    autoStart: false,
    minimizeToTray: true
  },
  ai: {
    localEnabled: true,
    provider: 'ollama',
    model: 'phi4-mini',
    endpoint: 'http://localhost:11434',
    timeoutMs: 30000
  },
  cloud: {
    fallbackEnabled: false,
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    apiKey: '',
    timeoutMs: 30000,
    maxRetries: 3
  },
  privacy: createDefaultPrivacySettings(),
  targetModel: {
    tokenizer: 'gpt-4'
  },
  advanced: {
    timeouts: {
      ollama: 30000,
      groq: 30000,
      verification: 10000
    },
    retryCount: 3,
    verificationThresholds: {
      semanticConfidence: 0.85,
      instructionConfidence: 0.95,
      technicalIntegrity: 0.99,
      privacyConfidence: 1.0,
      compressionConfidence: 0.8,
      overall: 0.9
    },
    logLevel: 'info',
    diagnostics: false
  }
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: TokenTrimEngine;
let settingsStore: Store<StoredSettings>;
let currentSettings: AppSettings = DEFAULT_SETTINGS;
let isQuitting = false;

function createSettingsStore(): Store<StoredSettings> {
  return new Store<StoredSettings>({
    name: 'settings',
    defaults: {
      ...DEFAULT_SETTINGS,
      version: 1
    } as StoredSettings,
    migrations: {
      '1.0.0': (stored: any) => {
        return { ...stored, version: 1 } as unknown as StoredSettings;
      }
    }
  });
}

function loadSettings(): AppSettings {
  const stored = settingsStore.store;
  return { ...DEFAULT_SETTINGS, ...stored };
}

function saveSettings(settings: Partial<AppSettings>): void {
  currentSettings = { ...currentSettings, ...settings };
  settingsStore.set(currentSettings as StoredSettings);
}

async function initializeEngine(): Promise<void> {
  const ollamaConfig = currentSettings.ai.localEnabled ? {
    baseUrl: currentSettings.ai.endpoint,
    model: currentSettings.ai.model,
    timeoutMs: currentSettings.ai.timeoutMs
  } : undefined;

  const groqConfig = currentSettings.cloud.fallbackEnabled && currentSettings.cloud.apiKey ? {
    apiKey: currentSettings.cloud.apiKey,
    model: currentSettings.cloud.model,
    baseUrl: (currentSettings.cloud as any).baseUrl || 'https://api.groq.com/openai/v1',
    timeoutMs: currentSettings.cloud.timeoutMs,
    maxRetries: currentSettings.cloud.maxRetries,
    retryDelayMs: 1000
  } : undefined;

  const config: TokenTrimEngineConfig = {
    targetModel: currentSettings.targetModel.tokenizer,
    ollamaConfig,
    groqConfig,
    verificationThresholds: currentSettings.advanced.verificationThresholds,
    enableTelemetry: true
  };

  engine = new TokenTrimEngine(config);
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: Math.min(900, width - 100),
    height: Math.min(700, height - 100),
    minWidth: 600,
    minHeight: 500,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Security: Prevent new window creation
  mainWindow.webContents.on('did-create-window' as any, (event: any) => {
    event.preventDefault();
  });

  // Load the app
  if (process.env['NODE_ENV'] === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && currentSettings.general.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register global shortcut
  registerGlobalShortcut();
}

function createTray(): void {
  // Create a simple tray icon (16x16)
  const icon = nativeImage.createEmpty();
  // In production, you'd load an actual icon file
  // const icon = nativeImage.createFromPath(join(__dirname, '../../assets/icon.png'));
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show TokenTrim',
      click: () => mainWindow?.show()
    },
    {
      label: 'Compress Clipboard',
      click: async () => {
        await compressClipboard();
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('navigate', 'settings');
      }
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('TokenTrim - LLM Input Optimizer');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

function registerGlobalShortcut(): void {
  globalShortcut.unregisterAll();
  
  const ret = globalShortcut.register(currentSettings.general.globalHotkey, async () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      await compressClipboard();
      mainWindow?.show();
    }
  });

  if (!ret) {
    console.warn('Failed to register global shortcut');
  }
}

async function compressClipboard(): Promise<void> {
  const { clipboard } = require('electron');
  const text = clipboard.readText();
  
  if (!text || text.trim().length === 0) {
    return;
  }

  try {
    const options = {
      targetModel: currentSettings.targetModel.tokenizer,
      maxCompressionRatio: currentSettings.general.compressionTarget === 'aggressive' ? 0.5 : 
                          currentSettings.general.compressionTarget === 'conservative' ? 0.2 : 0.35,
      preserveFormatting: true,
      allowCloudFallback: currentSettings.cloud.fallbackEnabled,
      requireConfirmationForCloud: currentSettings.privacy.requireCloudConfirmation,
      verificationThresholds: currentSettings.advanced.verificationThresholds
    };

    const result = await engine.compress(text, options);
    
    if (result.accepted && result.bestCandidate) {
      clipboard.writeText(result.bestCandidate.compressedText);
      
      // Notify renderer
      mainWindow?.webContents.send('compression:complete', {
        original: text,
        compressed: result.bestCandidate.compressedText,
        result
      });
    }
  } catch (error) {
    console.error('Clipboard compression failed:', error);
  }
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Compression
  ipcMain.handle('compress:request', async (_event, payload: CompressionRequest): Promise<CompressionResponse> => {
    try {
      const result = await engine.compress(payload.text, payload.options);
      return { result };
    } catch (error) {
      return { 
        result: {
          originalText: payload.text,
          bestCandidate: null,
          allCandidates: [],
          accepted: false,
          rejectionReason: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs: 0,
          originalTokens: 0,
          finalTokens: 0,
          grossReduction: 0,
          compressionOverhead: 0,
          netSavings: 0,
          estimatedCostSavings: 0,
          provider: 'deterministic',
          mode: 'local'
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Settings
  ipcMain.handle('settings:get', () => currentSettings);
  
  ipcMain.handle('settings:set', async (_event, settings: Partial<AppSettings>) => {
    // Handle API key separately (store in keytar)
    if (settings.cloud?.apiKey !== undefined) {
      if (settings.cloud.apiKey) {
        await keytar.setPassword(SERVICE_NAME, 'groq-api-key', settings.cloud.apiKey);
      } else {
        await keytar.deletePassword(SERVICE_NAME, 'groq-api-key');
      }
      // Don't store API key in settings
      const { cloud: { apiKey: _, ...cloudRest }, ...rest } = settings;
      saveSettings({ ...rest, cloud: { ...cloudRest, apiKey: '' } });
    } else {
      saveSettings(settings);
    }
    
    // Reinitialize engine with new settings
    await initializeEngine();
    registerGlobalShortcut();
  });

  ipcMain.handle('settings:reset', () => {
    settingsStore.clear();
    currentSettings = DEFAULT_SETTINGS;
    initializeEngine();
    registerGlobalShortcut();
    return currentSettings;
  });

  // Analytics
  ipcMain.handle('analytics:get', () => engine.getTelemetry().getAnalytics());

  // Benchmark
  ipcMain.handle('benchmark:run', async (_event, options: BenchmarkRunOptions) => {
    // Implementation would go here
    return { timestamp: Date.now(), totalCases: 0, passedCases: 0, failedCases: 0, results: [] };
  });

  // Provider health
  ipcMain.handle('provider:health', async (_event, provider: ProviderType) => {
    const health = await engine.healthCheck();
    return health[provider];
  });

  ipcMain.handle('provider:models', async (_event, provider: ProviderType) => {
    if (provider === 'ollama' && engine['ollamaProvider']) {
      return engine['ollamaProvider'].listModels();
    }
    if (provider === 'groq' && engine['groqProvider']) {
      return engine['groqProvider'].listModels();
    }
    return [];
  });

  // Privacy scan
  ipcMain.handle('privacy:scan', async (_event, text: string): Promise<SecretDetectionResult> => {
    // Use the engine's privacy detector
    return engine['privacyDetector'].scan(text);
  });

  // App info
  ipcMain.handle('app:version', () => app.getVersion());
  
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());
}

// App lifecycle
app.whenReady().then(async () => {
  settingsStore = createSettingsStore();
  currentSettings = loadSettings();
  
  // Load API key from keytar
  const apiKey = await keytar.getPassword(SERVICE_NAME, 'groq-api-key');
  if (apiKey) {
    currentSettings.cloud.apiKey = apiKey;
  }
  
  await initializeEngine();
  createWindow();
  createTray();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Security: Prevent certificate errors in production
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (process.env['NODE_ENV'] === 'production') {
    event.preventDefault();
    callback(false);
  } else {
    callback(true);
  }
});

// Security: Disable remote module (deprecated in newer Electron)
// app.allowRendererProcessReuse = true;