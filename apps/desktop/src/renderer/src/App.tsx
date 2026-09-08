import React, { useState, useEffect, useCallback } from 'react';
import { TabView, TabPanel, TabList, Tab } from './components/Tabs';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Input } from './components/Input';
import { Textarea } from './components/Textarea';
import { Select } from './components/Select';
import { Toggle } from './components/Toggle';
import { Badge } from './components/Badge';
import { Tooltip } from './components/Tooltip';
import { SettingsPanel } from './panels/SettingsPanel';
import { CompressionPanel } from './panels/CompressionPanel';
import { AnalyticsPanel } from './panels/AnalyticsPanel';
import { AboutPanel } from './panels/AboutPanel';
import type { AppSettings, CompressionResult, AnalyticsData, ProviderType, TargetModel } from '@tokentrim/shared';

const TABS = [
  { id: 'compress', label: 'Compress', icon: '✂️' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'about', label: 'About', icon: 'ℹ️' }
] as const;

type TabId = typeof TABS[number]['id'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('compress');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [windowMaximized, setWindowMaximized] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    checkWindowMaximized();
    
    // Listen for settings updates from main
    const unsubscribe = window.tokentrim.onSettingsUpdated((_event, newSettings) => {
      setSettings(newSettings);
    });
    
    return unsubscribe;
  }, []);

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.tokentrim.settings.get();
      setSettings(loadedSettings);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setIsLoading(false);
    }
  };

  const checkWindowMaximized = async () => {
    try {
      const maximized = await window.tokentrim.window.isMaximized();
      setWindowMaximized(maximized);
    } catch {}
  };

  const handleSettingsChange = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      await window.tokentrim.settings.set(newSettings);
      setSettings(prev => prev ? { ...prev, ...newSettings } : null);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">Loading TokenTrim...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="title-bar" onDoubleClick={() => window.tokentrim.window.maximize()}>
            <div className="app-icon">✂️</div>
            <h1 className="app-title">TokenTrim</h1>
            <span className="version-badge">v1.0.0</span>
          </div>
        </div>
        <div className="header-center">
          <TabView activeTab={activeTab} onChange={setActiveTab} tabs={TABS} />
        </div>
        <div className="header-right">
          <div className="window-controls">
            <Tooltip content="Minimize">
              <Button variant="ghost" size="icon" onClick={() => window.tokentrim.window.minimize()}>
                −
              </Button>
            </Tooltip>
            <Tooltip content={windowMaximized ? 'Restore' : 'Maximize'}>
              <Button variant="ghost" size="icon" onClick={() => window.tokentrim.window.maximize()}>
                {windowMaximized ? '❐' : '□'}
              </Button>
            </Tooltip>
            <Tooltip content="Close">
              <Button variant="ghost" size="icon" onClick={() => window.tokentrim.app.quit()}>
                ✕
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="main">
        <TabPanel activeTab={activeTab}>
          <div key="compress" className="tab-content">
            <CompressionPanel settings={settings} onSettingsChange={handleSettingsChange} />
          </div>
          <div key="analytics" className="tab-content">
            <AnalyticsPanel />
          </div>
          <div key="settings" className="tab-content">
            <SettingsPanel settings={settings} onSettingsChange={handleSettingsChange} />
          </div>
          <div key="about" className="tab-content">
            <AboutPanel />
          </div>
        </TabPanel>
      </main>

      <footer className="footer">
        <div className="footer-left">
          <span>Local-first LLM input optimization</span>
        </div>
        <div className="footer-right">
          <a href="https://github.com/tokentrim/tokentrim" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span>·</span>
          <a href="https://tokentrim.dev/docs" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;