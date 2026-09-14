import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select, SelectOption } from '../components/Select';
import { Toggle } from '../components/Toggle';
import { Badge } from '../components/Badge';
import { Tooltip } from '../components/Tooltip';
import type { AppSettings } from '@tokentrim/shared';

const COMPRESSION_TARGETS: SelectOption[] = [
  { value: 'conservative', label: 'Conservative (10-20%)' },
  { value: 'balanced', label: 'Balanced (20-35%)' },
  { value: 'aggressive', label: 'Aggressive (35-50%)' }
];

const THEME_OPTIONS: SelectOption[] = [
  { value: 'system', label: 'System Default' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

const MODE_OPTIONS: SelectOption[] = [
  { value: 'local', label: 'Local Only (Ollama)' },
  { value: 'cloud', label: 'Cloud Only (Groq)' },
  { value: 'auto', label: 'Auto (Local when available, Cloud fallback)' }
];

const GROQ_MODELS: SelectOption[] = [
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fast)' },
  { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile (Smart)' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B' }
];

interface SettingsPanelProps {
  settings: AppSettings | null;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '********';
  return key.slice(0, 4) + '********' + key.slice(-4);
}

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [groqStatus, setGroqStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [groqApiKey, setGroqApiKey] = useState('');

  // Sync groqApiKey with settings when they change
  React.useEffect(() => {
    if (settings?.cloud?.apiKey) {
      setGroqApiKey(settings.cloud.apiKey);
    } else {
      setGroqApiKey('');
    }
  }, [settings?.cloud?.apiKey]);

  // Check provider status on mount
  React.useEffect(() => {
    checkProviders();
  }, []);

  const checkProviders = async () => {
    try {
      const health = await window.tokentrim.providers.health('ollama');
      setOllamaStatus(health.healthy ? 'connected' : 'disconnected');
    } catch {
      setOllamaStatus('disconnected');
    }

    try {
      const health = await window.tokentrim.providers.health('groq');
      setGroqStatus(health.healthy ? 'connected' : 'disconnected');
    } catch {
      setGroqStatus('disconnected');
    }
  };

  const handleNestedChange = (parentKey: keyof AppSettings, childKey: string, value: any) => {
    if (!settings) return;
    const parent = settings[parentKey] as Record<string, any>;
    onSettingsChange({
      [parentKey]: { ...parent, [childKey]: value }
    } as Partial<AppSettings>);
  };

  if (!settings) return null;

  return (
    <div className="settings-panel">
      {/* General Settings - Only Theme & Compression Target */}
      <Card>
        <CardHeader title="General" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Select
              label="Theme"
              value={settings.general.theme}
              onChange={e => handleNestedChange('general', 'theme', e.target.value as any)}
              options={THEME_OPTIONS}
              style={{ width: 280 }}
            />
            <Select
              label="Compression Target"
              value={settings.general.compressionTarget}
              onChange={e => handleNestedChange('general', 'compressionTarget', e.target.value as any)}
              options={COMPRESSION_TARGETS}
            />
            <Select
              label="Processing Mode"
              value={settings.general.compressionMode || 'auto'}
              onChange={e => handleNestedChange('general', 'compressionMode', e.target.value as any)}
              options={MODE_OPTIONS}
              style={{ width: 320 }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Local AI Settings */}
      <Card>
        <CardHeader 
          title="Local AI (Ollama)" 
          action={
            <span className="flex items-center gap-4">
              <Badge variant={ollamaStatus === 'connected' ? 'success' : ollamaStatus === 'checking' ? 'warning' : 'error'}>
                {ollamaStatus === 'connected' ? 'Connected' : ollamaStatus === 'checking' ? 'Checking...' : 'Disconnected'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={checkProviders}>⟳</Button>
            </span>
          }
        />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Toggle
              label="Enable local AI compression"
              checked={settings.ai.localEnabled}
              onChange={v => handleNestedChange('ai', 'localEnabled', v)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input
                label="Ollama Endpoint"
                value={settings.ai.endpoint}
                onChange={e => handleNestedChange('ai', 'endpoint', e.target.value)}
                placeholder="http://localhost:11434"
                disabled={!settings.ai.localEnabled}
              />
              <Input
                label="Model"
                value={settings.ai.model}
                onChange={e => handleNestedChange('ai', 'model', e.target.value)}
                placeholder="phi4-mini"
                disabled={!settings.ai.localEnabled}
              />
            </div>
            <Input
              type="number"
              label="Timeout (ms)"
              value={String(settings.ai.timeoutMs)}
              onChange={e => handleNestedChange('ai', 'timeoutMs', parseInt(e.target.value) || 30000)}
              disabled={!settings.ai.localEnabled}
              style={{ width: 200 }}
            />
            <p className="text-sm text-muted">
              Requires Ollama running locally. <a href="https://ollama.ai" target="_blank" rel="noopener">Install Ollama</a> then run <code>ollama pull phi4-mini</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cloud AI Settings - Simplified */}
      <Card>
        <CardHeader 
          title="Cloud AI (Groq)" 
          action={
            <span className="flex items-center gap-4">
              <Badge variant={groqStatus === 'connected' ? 'success' : groqStatus === 'checking' ? 'warning' : 'error'}>
                {groqStatus === 'connected' ? 'Connected' : groqStatus === 'checking' ? 'Checking...' : 'Disconnected'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={checkProviders}>⟳</Button>
            </span>
          }
        />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Toggle
              label="Enable cloud fallback"
              checked={settings.cloud.fallbackEnabled}
              onChange={v => handleNestedChange('cloud', 'fallbackEnabled', v)}
            />
            <Select
              label="Model"
              value={settings.cloud.model}
              onChange={e => handleNestedChange('cloud', 'model', e.target.value)}
              options={GROQ_MODELS}
              disabled={!settings.cloud.fallbackEnabled}
              style={{ width: 320 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input
                label="API Key"
                type="password"
                value={groqApiKey || (settings.cloud.apiKey ? maskApiKey(settings.cloud.apiKey) : '')}
                onChange={e => setGroqApiKey(e.target.value)}
                placeholder={settings.cloud.apiKey ? '••••••••••••' : 'gsk_...'}
                disabled={!settings.cloud.fallbackEnabled}
              />
              <div className="flex items-end">
                <Button 
                  variant={groqApiKey ? 'primary' : 'secondary'} 
                  size="sm"
                  onClick={async () => {
                    if (groqApiKey) {
                      await window.tokentrim.settings.set({ cloud: { ...settings.cloud, apiKey: groqApiKey } });
                      // Don't clear - let it re-sync from settings (shows masked)
                      checkProviders();
                    }
                  }}
                  disabled={!groqApiKey || !settings.cloud.fallbackEnabled}
                >
                  {groqApiKey ? 'Update Key' : 'Save Key'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted">
              Get your API key from <a href="https://console.groq.com" target="_blank" rel="noopener">Groq Console</a>. 
              Keys are stored securely in system keychain.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card style={{ borderColor: 'var(--color-error)' }}>
        <CardHeader title="Danger Zone" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p className="text-sm text-muted">
              These actions are irreversible.
            </p>
            <Button 
              variant="danger" 
              onClick={async () => {
                if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                  await window.tokentrim.settings.reset();
                }
              }}
            >
              Reset All Settings
            </Button>
            <Button 
              variant="danger" 
              onClick={async () => {
                if (confirm('Clear all analytics data? This cannot be undone.')) {
                  window.tokentrim.analytics.get().then(() => {
                    // Would need a clear method on telemetry
                  });
                }
              }}
            >
              Clear Analytics Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}