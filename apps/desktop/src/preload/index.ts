import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CompressionRequest, CompressionResponse, AppSettings, BenchmarkRunOptions, ProviderType, SecretDetectionResult, AnalyticsData, CompressionResult } from '@tokentrim/shared';

// Secure IPC channel allowlist
const ALLOWED_CHANNELS = {
  // Main -> Renderer (one-way)
  receive: [
    'compression:complete',
    'navigate',
    'settings:updated',
    'provider:status',
    'log:info',
    'log:warn',
    'log:error'
  ],
  // Renderer -> Main (invoke)
  invoke: [
    'compress:request',
    'settings:get',
    'settings:set',
    'settings:reset',
    'analytics:get',
    'benchmark:run',
    'provider:health',
    'provider:models',
    'privacy:scan',
    'app:version',
    'app:quit',
    'window:minimize',
    'window:maximize',
    'window:close',
    'window:isMaximized',
    'popup:get-text',
    'popup:compress',
    'popup:apply',
    'popup:cancel'
  ],
  // Renderer -> Main (send)
  send: [
    'renderer:ready'
  ]
} as const;

// Type-safe IPC wrapper
function createSafeInvoke<T extends string>(channel: T) {
  return (payload: any) => {
    if (!ALLOWED_CHANNELS.invoke.includes(channel as any)) {
      throw new Error(`Channel ${channel} not allowed for invoke`);
    }
    return ipcRenderer.invoke(channel, payload);
  };
}

function createSafeSend<T extends string>(channel: T) {
  return (payload: any) => {
    if (!ALLOWED_CHANNELS.send.includes(channel as any)) {
      throw new Error(`Channel ${channel} not allowed for send`);
    }
    ipcRenderer.send(channel, payload);
  };
}

function createSafeOn<T extends string>(channel: T) {
  return (listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    if (!ALLOWED_CHANNELS.receive.includes(channel as any)) {
      throw new Error(`Channel ${channel} not allowed for on`);
    }
    const subscription = (_event: IpcRendererEvent, ...args: any[]) => listener(_event, ...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  };
}

// Expose secure API to renderer
contextBridge.exposeInMainWorld('tokentrim', {
  // Compression
  compress: createSafeInvoke('compress:request'),
  
  // Settings
  settings: {
    get: createSafeInvoke('settings:get'),
    set: createSafeInvoke('settings:set'),
    reset: createSafeInvoke('settings:reset')
  },
  
  // Analytics
  analytics: {
    get: createSafeInvoke('analytics:get')
  },
  
  // Benchmark
  benchmark: {
    run: createSafeInvoke('benchmark:run')
  },
  
  // Providers
  providers: {
    health: createSafeInvoke('provider:health'),
    models: createSafeInvoke('provider:models')
  },
  
  // Privacy
  privacy: {
    scan: createSafeInvoke('privacy:scan')
  },
  
  // App
  app: {
    version: createSafeInvoke('app:version'),
    quit: createSafeInvoke('app:quit')
  },
  
  // Window controls
  window: {
    minimize: createSafeInvoke('window:minimize'),
    maximize: createSafeInvoke('window:maximize'),
    close: createSafeInvoke('window:close'),
    isMaximized: createSafeInvoke('window:isMaximized')
  },
  
  // Popup
  popup: {
    getText: createSafeInvoke('popup:get-text'),
    compress: createSafeInvoke('popup:compress'),
    apply: createSafeInvoke('popup:apply'),
    cancel: createSafeInvoke('popup:cancel')
  },
  
  // Events
  onCompressionComplete: createSafeOn('compression:complete'),
  onNavigate: createSafeOn('navigate'),
  onSettingsUpdated: createSafeOn('settings:updated'),
  onProviderStatus: createSafeOn('provider:status')
});

// Type declarations for the renderer
declare global {
  interface Window {
    tokentrim: {
      compress: (payload: CompressionRequest) => Promise<CompressionResponse>;
      settings: {
        get: () => Promise<AppSettings>;
        set: (settings: Partial<AppSettings>) => Promise<void>;
        reset: () => Promise<AppSettings>;
      };
      analytics: {
        get: () => Promise<AnalyticsData>;
      };
      benchmark: {
        run: (options: BenchmarkRunOptions) => Promise<any>;
      };
      providers: {
        health: (provider: ProviderType) => Promise<any>;
        models: (provider: ProviderType) => Promise<string[]>;
      };
      privacy: {
        scan: (text: string) => Promise<SecretDetectionResult>;
      };
      app: {
        version: () => Promise<string>;
        quit: () => Promise<void>;
      };
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
      popup: {
        getText: () => Promise<string>;
        compress: (text: string) => Promise<CompressionResult>;
        apply: (compressedText: string) => Promise<void>;
        cancel: () => Promise<void>;
      };
      onCompressionComplete: (listener: (event: any, data: any) => void) => () => void;
      onNavigate: (listener: (event: any, page: string) => void) => () => void;
      onSettingsUpdated: (listener: (event: any, settings: AppSettings) => void) => () => void;
      onProviderStatus: (listener: (event: any, status: any) => void) => () => void;
    };
  }
}