import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';
import type { AnalyticsData } from '@tokentrim/shared';

export function AnalyticsPanel() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const data = await window.tokentrim.analytics.get();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent style={{ textAlign: 'center', padding: 60 }}>
          <div className="loading-spinner" />
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent style={{ textAlign: 'center', padding: 60 }}>
          <p>No analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="analytics-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
      {/* Overview Cards */}
      <Card>
        <CardHeader title="Overview" />
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <StatCard label="Total Prompts" value={formatNumber(analytics.totalPrompts)} />
            <StatCard label="Original Tokens" value={formatNumber(analytics.totalOriginalTokens)} />
            <StatCard label="Optimized Tokens" value={formatNumber(analytics.totalOptimizedTokens)} />
            <StatCard label="Net Tokens Saved" value={formatNumber(analytics.netTokensSaved)} variant="success" />
            <StatCard label="Gross Reduction" value={`${((analytics.grossTokensSaved / analytics.totalOriginalTokens) * 100).toFixed(1)}%`} />
            <StatCard label="Est. Cost Savings" value={`$${analytics.estimatedMoneySaved.toFixed(2)}`} variant="success" />
            <StatCard label="Avg Latency" value={`${analytics.averageLatencyMs.toFixed(0)}ms`} />
            <StatCard label="Failure Rate" value={`${analytics.failureRate.toFixed(1)}%`} variant={analytics.failureRate > 5 ? 'warning' : 'success'} />
          </div>
        </CardContent>
      </Card>

      {/* Processing Mode */}
      <Card>
        <CardHeader title="Processing Mode" />
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <StatCard 
              label="Local Processing" 
              value={`${analytics.localCompressionPercentage.toFixed(1)}%`} 
              variant="success"
            />
            <StatCard 
              label="Cloud Processing" 
              value={`${analytics.cloudCompressionPercentage.toFixed(1)}%`} 
              variant="warning"
            />
            <StatCard 
              label="Cloud Escalation Rate" 
              value={`${analytics.cloudEscalationRate.toFixed(1)}%`} 
            />
          </div>
        </CardContent>
      </Card>

      {/* By Provider */}
      <Card>
        <CardHeader title="By Provider" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(analytics.byProvider).map(([provider, stats]) => (
              provider !== 'deterministic' && stats.prompts > 0 && (
                <ProviderStatCard key={provider} provider={provider} stats={stats} />
              )
            ))}
            {analytics.byProvider.deterministic.prompts > 0 && (
              <ProviderStatCard key="deterministic" provider="deterministic" stats={analytics.byProvider.deterministic} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Content Type */}
      <Card>
        <CardHeader title="By Content Type" />
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(analytics.byContentType)
              .filter(([, stats]) => stats.prompts > 0)
              .sort(([, a], [, b]) => b.prompts - a.prompts)
              .map(([type, stats]) => (
                <ContentTypeStatCard key={type} type={type} stats={stats} />
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, variant = 'neutral' }: { label: string; value: string; variant?: 'neutral' | 'success' | 'warning' }) {
  return (
    <div style={{ 
      padding: 16, 
      background: 'var(--color-bg)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)'
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)', color: variant === 'success' ? 'var(--color-success)' : variant === 'warning' ? 'var(--color-warning)' : 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}

function ProviderStatCard({ provider, stats }: { provider: string; stats: any }) {
  const providerLabels: Record<string, string> = {
    deterministic: 'Tier 0 (Deterministic)',
    ollama: 'Ollama (Local)',
    groq: 'Groq (Cloud)'
  };

  return (
    <div style={{ 
      padding: 16, 
      background: 'var(--color-bg)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)'
    }}>
      <div className="flex items-center justify-between mb-8">
        <span className="font-medium">{providerLabels[provider] || provider}</span>
        <Badge variant={provider === 'ollama' ? 'success' : provider === 'groq' ? 'warning' : 'primary'}>
          {stats.prompts} prompts
        </Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
        <div>
          <div className="text-muted">Net Savings</div>
          <div className="font-mono font-semibold text-success">{stats.netSavings.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted">Avg Latency</div>
          <div className="font-mono">{stats.averageLatencyMs.toFixed(0)}ms</div>
        </div>
        <div>
          <div className="text-muted">Failures</div>
          <div className="font-mono">{stats.failureCount}</div>
        </div>
      </div>
    </div>
  );
}

function ContentTypeStatCard({ type, stats }: { type: string; stats: any }) {
  return (
    <div style={{ 
      padding: 12, 
      background: 'var(--color-bg)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <span className="font-medium text-sm">{type.replace(/_/g, ' ')}</span>
      <div className="flex items-center gap-12 text-sm">
        <span className="text-muted">{stats.prompts} prompts</span>
        <span className="text-success font-mono">{(stats.averageReduction * 100).toFixed(1)}% avg reduction</span>
        <span className="text-success font-mono">{stats.averageNetSavings.toFixed(0)} avg net savings</span>
      </div>
    </div>
  );
}