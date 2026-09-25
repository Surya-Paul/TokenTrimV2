import { useState, useEffect } from 'react';
import { TabView } from './components/Tabs';
import { CompressionPanel } from './panels/CompressionPanel';
import { AnalyticsPanel, createEmptySessionStats } from './panels/AnalyticsPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { AboutPanel } from './panels/AboutPanel';
import { AppSettings, defaultSettings } from './settings';
import { api } from './api/client';
import { COMPRESSION_TARGETS } from './compression-targets';
import type { ApiHealthResponse, ApiCompressionResponse } from '@tokentrim/shared';

export function App() {
  const [activeTab, setActiveTab] = useState('compress');
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('tokentrim_settings');
    if (!saved) return defaultSettings;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...defaultSettings,
        ...parsed,
        general: { ...defaultSettings.general, ...(parsed.general || {}) },
        privacy: { ...defaultSettings.privacy, ...(parsed.privacy || {}) },
        targetModel: { ...defaultSettings.targetModel, ...(parsed.targetModel || {}) },
        advanced: { ...defaultSettings.advanced, ...(parsed.advanced || {}) },
      };
    } catch {
      localStorage.removeItem('tokentrim_settings');
      return defaultSettings;
    }
  });
  const [health, setHealth] = useState<ApiHealthResponse | null>(null);
  
  const [sessionStats, setSessionStats] = useState(createEmptySessionStats);

  const handleCompressionComplete = (result: NonNullable<ApiCompressionResponse['data']>) => {
    setSessionStats(prev => {
      const target = result.compressionTarget ?? settings.general.compressionTarget;
      const targetDefinition = COMPRESSION_TARGETS[target];
      const actualReductionPercent = result.actualReductionPercent
        ?? (result.originalTokens > 0 ? (result.grossReduction / result.originalTokens) * 100 : 0);
      const targetAchieved = result.targetAchieved
        ?? (result.accepted
          && actualReductionPercent >= targetDefinition.minimumReductionRatio * 100
          && actualReductionPercent <= targetDefinition.maximumReductionRatio * 100);
      const safeResultMode = result.safeResultMode ?? true;
      const isSafeFallback = result.accepted && !targetAchieved && safeResultMode;
      const isForcedTarget = result.forcedTargetResult ?? false;
      
      const pCount = prev.providers[result.provider] || 0;
      const tCount = prev.tiers[result.tier] || 0;
      const previousTargetStats = prev.targets[target];
      return {
        requests: prev.requests + 1,
        accepted: prev.accepted + (result.accepted ? 1 : 0),
        rejected: prev.rejected + (result.accepted ? 0 : 1),
        originalTokens: prev.originalTokens + result.originalTokens,
        compressedTokens: prev.compressedTokens + result.compressedTokens,
        grossTokensSaved: prev.grossTokensSaved + result.grossReduction,
        netSavings: prev.netSavings + result.netSavings,
        totalProcessingTimeMs: prev.totalProcessingTimeMs + result.processingTimeMs,
        providers: { ...prev.providers, [result.provider]: pCount + 1 },
        tiers: { ...prev.tiers, [result.tier]: tCount + 1 },
        targets: {
          ...prev.targets,
          [target]: {
            requests: previousTargetStats.requests + 1,
            accepted: previousTargetStats.accepted + (result.accepted ? 1 : 0),
            originalTokens: previousTargetStats.originalTokens + result.originalTokens,
            grossTokensSaved: previousTargetStats.grossTokensSaved + result.grossReduction,
            targetHits: previousTargetStats.targetHits + (targetAchieved ? 1 : 0)
          }
        },
        safeFallbacks: prev.safeFallbacks + (isSafeFallback ? 1 : 0),
        forcedOutputs: prev.forcedOutputs + (isForcedTarget ? 1 : 0),
        history: [{
          id: `${Date.now()}-${prev.requests + 1}`,
          completedAt: Date.now(),
          accepted: result.accepted,
          provider: result.provider,
          tier: result.tier,
          target,
          targetReductionPercent: result.targetReductionPercent ?? targetDefinition.targetReductionRatio * 100,
          actualReductionPercent,
          targetAchieved,
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
          grossReduction: result.grossReduction,
          netSavings: result.netSavings,
          processingTimeMs: result.processingTimeMs,
          safetyScore: result.safetyScores.overall,
          safeResultMode,
          forcedTargetResult: isForcedTarget,
          fallbackReason: result.fallbackReason
        }, ...prev.history].slice(0, 12)
      };
    });
  };

  useEffect(() => {
    localStorage.setItem('tokentrim_settings', JSON.stringify(settings));
    document.documentElement.setAttribute('data-theme', settings.general.theme === 'system' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
      : settings.general.theme);
  }, [settings]);

  useEffect(() => {
    // Check API health on load
    api.checkHealth().then(setHealth).catch(console.error);
  }, []);

  const handleSettingsChange = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const tabs = [
    { id: 'compress', label: 'Compress', icon: '✂️' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'about', label: 'About', icon: 'ℹ️' }
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">✂️</span>
          <span className="logo-text">TokenTrim</span>
          {health && health.status === 'ok' && (
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)' }} title="API Connected" />
          )}
        </div>
        <TabView activeTab={activeTab} onChange={setActiveTab} tabs={tabs} />
      </header>

      <main className="app-content">
        {activeTab === 'compress' && <CompressionPanel settings={settings} onComplete={handleCompressionComplete} />}
        {activeTab === 'analytics' && <AnalyticsPanel stats={sessionStats} onReset={() => setSessionStats(createEmptySessionStats())} />}
        {activeTab === 'settings' && <SettingsPanel settings={settings} onUpdate={handleSettingsChange} />}
        {activeTab === 'about' && <AboutPanel />}
      </main>
    </div>
  );
}
