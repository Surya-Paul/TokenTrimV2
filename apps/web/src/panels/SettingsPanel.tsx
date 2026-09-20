import { Card, CardHeader, CardContent } from '../components/Card';
import { Toggle } from '../components/Toggle';
import { AppSettings } from '../settings';

export function SettingsPanel({ settings, onUpdate }: { settings: AppSettings, onUpdate: (s: Partial<AppSettings>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800, margin: '0 auto' }}>
      
      <Card>
        <CardHeader title="General" />
        <CardContent>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <select 
              className="select-field"
              value={settings.general.theme}
              onChange={e => onUpdate({ general: { ...settings.general, theme: e.target.value as AppSettings['general']['theme'] } })}
            >
              <option value="system">System Default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">Compression Target</label>
            <select 
              className="select-field"
              value={settings.general.compressionTarget}
              onChange={e => onUpdate({ general: { ...settings.general, compressionTarget: e.target.value as AppSettings['general']['compressionTarget'] } })}
            >
              <option value="conservative">Conservative (Safest, ~20% reduction)</option>
              <option value="balanced">Balanced (Recommended, ~35% reduction)</option>
              <option value="aggressive">Aggressive (Max compression, ~50% reduction)</option>
              <option value="extreme">Extreme (Highest reduction, ~75% when safe)</option>
            </select>
            <p className="text-muted text-sm" style={{ margin: '8px 0 0' }}>
              Targets are safety-bounded. Prompts with code, identifiers, or strict requirements may reduce less to preserve meaning.
            </p>
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <Toggle
              id="safe-result-mode"
              label="Safe Result Mode"
              checked={settings.general.safeResultMode}
              onChange={checked => onUpdate({ general: { ...settings.general, safeResultMode: checked } })}
            />
            <p className="text-muted text-sm" style={{ margin: '6px 0 0 48px' }}>
              Return the safest verified result. When OFF (Force Target Mode), always returns the closest output to the target, bypassing safety checks if necessary.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Target Model Tokenizer</label>
            <select 
              className="select-field"
              value={settings.targetModel.tokenizer}
              onChange={e => onUpdate({ targetModel: { ...settings.targetModel, tokenizer: e.target.value as AppSettings['targetModel']['tokenizer'] } })}
            >
              <option value="gpt-4">GPT-4 / GPT-4o (OpenAI)</option>
              <option value="claude-3-opus">Claude 3 (Anthropic)</option>
              <option value="llama-3-8b">Llama 3</option>
              <option value="gemini-1.5-pro">Gemini (Google)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="API Configuration" />
        <CardContent>
          <div className="text-muted" style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
            <strong>Note:</strong> API credentials (such as Groq API keys) are configured securely on the server via environment variables. 
            Client-side configuration is disabled in this web deployment to ensure security. Contact your administrator to update backend credentials.
          </div>
        </CardContent>
      </Card>
      
    </div>
  );
}
