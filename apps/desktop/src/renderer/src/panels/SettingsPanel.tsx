import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select, SelectOption } from '../components/Select';
import { Toggle } from '../components/Toggle';
import { Badge } from '../components/Badge';
import { Tooltip } from '../components/Tooltip';
import type { AppSettings } from '@tokentrim/shared';

const TARGET_MODELS: SelectOption[] = [
  { value: 'gpt-4', label: 'GPT-4 / GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'llama-3-70b', label: 'Llama 3 70B' },
  { value: 'llama-3-8b', label: 'Llama 3 8B' },
  { value: 'qwen-2.5-72b', label: 'Qwen 2.5 72B' },
  { value: 'phi-4-mini', label: 'Phi-4 Mini' },
  { value: 'custom', label: 'Custom / Generic' }
];

const COMPRESSION_TARGETS: SelectOption[] = [
  { value: 'conservative', label: 'Conservative (10-20%)' },
  { value: 'balanced', label: 'Balanced (20-35%)' },
  { value: 'aggressive', label: 'Aggressive (35-50%)' }
];

interface SettingsPanelProps {
  settings: AppSettings | null;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [groqStatus, setGroqStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [groqApiKey, setGroqApiKey] = useState('');

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

  const handleChange = (key: keyof AppSettings, value: any) => {
    onSettingsChange({ [key]: value } as Partial<AppSettings>);
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
      {/* General Settings */}
      <Card>
        <CardHeader title="General" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Toggle
              label="Enable TokenTrim"
              checked={settings.general.enabled}
              onChange={v => handleNestedChange('general', 'enabled', v)}
            />
            <Toggle
              label="Preview mode (show diff before applying)"
              checked={settings.general.previewMode}
              onChange={v => handleNestedChange('general', 'previewMode', v)}
            />
            <Toggle
              label="Auto-start on login"
              checked={settings.general.autoStart}
              onChange={v => handleNestedChange('general', 'autoStart', v)}
            />
            <Toggle
              label="Minimize to tray on close"
              checked={settings.general.minimizeToTray}
              onChange={v => handleNestedChange('general', 'minimizeToTray', v)}
            />
            <div className="flex items-center gap-8">
              <Input
                label="Global Hotkey"
                value={settings.general.globalHotkey}
                onChange={e => handleNestedChange('general', 'globalHotkey', e.target.value)}
                placeholder="CommandOrControl+Shift+T"
                style={{ width: 280 }}
              />
              <span className="text-xs text-muted">Press keys to set (requires restart)</span>
            </div>
            <Select
              label="Compression Target"
              value={settings.general.compressionTarget}
              onChange={e => handleNestedChange('general', 'compressionTarget', e.target.value as any)}
              options={COMPRESSION_TARGETS}
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

      {/* Cloud AI Settings */}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Select
                label="Model"
                value={settings.cloud.model}
                onChange={e => handleNestedChange('cloud', 'model', e.target.value)}
                options={[
                  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fast)' },
                  { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile (Smart)' },
                  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
                  { value: 'gemma2-9b-it', label: 'Gemma 2 9B' }
                ]}
                disabled={!settings.cloud.fallbackEnabled}
              />
              <Input
                type="number"
                label="Timeout (ms)"
                value={String(settings.cloud.timeoutMs)}
                onChange={e => handleNestedChange('cloud', 'timeoutMs', parseInt(e.target.value) || 30000)}
                disabled={!settings.cloud.fallbackEnabled}
                style={{ width: 200 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input
                label="API Key"
                type="password"
                value={groqApiKey}
                onChange={e => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                disabled={!settings.cloud.fallbackEnabled}
              />
              <div className="flex items-end">
                <Button 
                  variant={groqApiKey ? 'primary' : 'secondary'} 
                  size="sm"
                  onClick={async () => {
                    await window.tokentrim.settings.set({ cloud: { ...settings.cloud, apiKey: groqApiKey } });
                    checkProviders();
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

      {/* Privacy Settings */}
      <Card>
        <CardHeader title="Privacy & Security" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Toggle
              label="Never send detected secrets to cloud"
              checked={settings.privacy.neverSendSecrets}
              onChange={v => handleNestedChange('privacy', 'neverSendSecrets', v)}
            />
            <Toggle
              label="Allow cloud processing (when enabled)"
              checked={settings.privacy.allowCloudProcessing}
              onChange={v => handleNestedChange('privacy', 'allowCloudProcessing', v)}
            />
            <Toggle
              label="Require confirmation before cloud processing"
              checked={settings.privacy.requireCloudConfirmation}
              onChange={v => handleNestedChange('privacy', 'requireCloudConfirmation', v)}
            />
            <Toggle
              label="Mask secrets in logs"
              checked={settings.privacy.maskSecretsInLogs}
              onChange={v => handleNestedChange('privacy', 'maskSecretsInLogs', v)}
            />
            <Toggle
              label="Local-only mode (disable all cloud features)"
              checked={settings.privacy.localOnlyMode}
              onChange={v => handleNestedChange('privacy', 'localOnlyMode', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Target Model */}
      <Card>
        <CardHeader title="Target Model Tokenizer" />
        <CardContent>
          <Select
            label="Target Model"
            value={settings.targetModel.tokenizer}
            onChange={e => handleNestedChange('targetModel', 'tokenizer', e.target.value as any)}
            options={TARGET_MODELS}
          />
          <p className="text-sm text-muted mt-8">
            Token counts and compression decisions use the selected model's tokenizer.
          </p>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader title="Advanced" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h4 className="font-medium">Verification Thresholds</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                label="Semantic Confidence"
                value={String(settings.advanced.verificationThresholds.semanticConfidence)}
                onChange={e => handleNestedChange('advanced', 'verificationThresholds', { 
                  ...settings.advanced.verificationThresholds, 
                  semanticConfidence: parseFloat(e.target.value) 
                })}
                style={{ width: 200 }}
              />
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                label="Instruction Confidence"
                value={String(settings.advanced.verificationThresholds.instructionConfidence)}
                onChange={e => handleNestedChange('advanced', 'verificationThresholds', { 
                  ...settings.advanced.verificationThresholds, 
                  instructionConfidence: parseFloat(e.target.value) 
                })}
                style={{ width: 200 }}
              />
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                label="Technical Integrity"
                value={String(settings.advanced.verificationThresholds.technicalIntegrity)}
                onChange={e => handleNestedChange('advanced', 'verificationThresholds', { 
                  ...settings.advanced.verificationThresholds, 
                  technicalIntegrity: parseFloat(e.target.value) 
                })}
                style={{ width: 200 }}
              />
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                label="Overall Threshold"
                value={String(settings.advanced.verificationThresholds.overall)}
                onChange={e => handleNestedChange('advanced', 'verificationThresholds', { 
                  ...settings.advanced.verificationThresholds, 
                  overall: parseFloat(e.target.value) 
                })}
                style={{ width: 200 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 16 }}>
              <Select
                label="Log Level"
                value={settings.advanced.logLevel}
                onChange={e => handleNestedChange('advanced', 'logLevel', e.target.value as any)}
                options={[
                  { value: 'debug', label: 'Debug' },
                  { value: 'info', label: 'Info' },
                  { value: 'warn', label: 'Warn' },
                  { value: 'error', label: 'Error' }
                ]}
              />
              <Toggle
                label="Enable diagnostics"
                checked={settings.advanced.diagnostics}
                onChange={v => handleNestedChange('advanced', 'diagnostics', v)}
              />
            </div>
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