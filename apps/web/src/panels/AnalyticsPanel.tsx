import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardHeader } from '../components/Card';
import { COMPRESSION_TARGETS } from '../compression-targets';
import type { CompressionTarget } from '@tokentrim/shared';

export interface TargetSessionStats {
  requests: number;
  accepted: number;
  originalTokens: number;
  grossTokensSaved: number;
  targetHits: number;
}

export interface CompressionHistoryItem {
  id: string;
  completedAt: number;
  accepted: boolean;
  provider: string;
  tier: string;
  target: CompressionTarget;
  targetReductionPercent: number;
  actualReductionPercent: number;
  targetAchieved: boolean;
  originalTokens: number;
  compressedTokens: number;
  grossReduction: number;
  netSavings: number;
  processingTimeMs: number;
  safetyScore: number;
  safeResultMode: boolean;
  forcedTargetResult: boolean;
  fallbackReason?: string;
}

export interface SessionStats {
  requests: number;
  accepted: number;
  rejected: number;
  originalTokens: number;
  compressedTokens: number;
  grossTokensSaved: number;
  netSavings: number;
  totalProcessingTimeMs: number;
  providers: Record<string, number>;
  tiers: Record<string, number>;
  targets: Record<CompressionTarget, TargetSessionStats>;
  history: CompressionHistoryItem[];
  safeFallbacks: number;
  forcedOutputs: number;
}

const targetKeys = Object.keys(COMPRESSION_TARGETS) as CompressionTarget[];

export function createEmptySessionStats(): SessionStats {
  const targets = targetKeys.reduce<Record<CompressionTarget, TargetSessionStats>>((result, target) => {
    result[target] = {
      requests: 0,
      accepted: 0,
      originalTokens: 0,
      grossTokensSaved: 0,
      targetHits: 0
    };
    return result;
  }, {} as Record<CompressionTarget, TargetSessionStats>);

  return {
    requests: 0,
    accepted: 0,
    rejected: 0,
    originalTokens: 0,
    compressedTokens: 0,
    grossTokensSaved: 0,
    netSavings: 0,
    totalProcessingTimeMs: 0,
    providers: {},
    tiers: {},
    targets,
    history: [],
    safeFallbacks: 0,
    forcedOutputs: 0
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercentage(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function formatTime(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function AnalyticsPanel({ stats, onReset }: { stats: SessionStats; onReset?: () => void }) {
  const outputReduction = rate(stats.grossTokensSaved, stats.originalTokens);
  const successRate = rate(stats.accepted, stats.requests);
  const targetHitRate = rate(
    targetKeys.reduce((total, target) => total + stats.targets[target].targetHits, 0),
    stats.accepted
  );
  const averageLatency = stats.requests > 0 ? stats.totalProcessingTimeMs / stats.requests : 0;
  const providerEntries = Object.entries(stats.providers).sort(([, left], [, right]) => right - left);

  return (
    <div className="analytics-page">
      <div className="analytics-heading">
        <div>
          <p className="analytics-kicker">Live session</p>
          <h2>Compression analytics</h2>
          <p className="text-muted m-0">Track output reduction, safety acceptance, target accuracy, and API efficiency.</p>
        </div>
        {onReset && (
          <Button variant="secondary" size="sm" onClick={onReset} disabled={stats.requests === 0}>
            Reset session
          </Button>
        )}
      </div>

      <section className="analytics-metric-grid" aria-label="Session summary">
        <div className="analytics-metric-card">
          <span className="analytics-metric-label">Output reduction</span>
          <strong className="analytics-metric-value text-success">{formatPercentage(outputReduction)}</strong>
          <span className="analytics-metric-detail">{formatNumber(stats.grossTokensSaved)} tokens removed</span>
        </div>
        <div className="analytics-metric-card">
          <span className="analytics-metric-label">Safe acceptance</span>
          <strong className="analytics-metric-value">{formatPercentage(successRate)}</strong>
          <span className="analytics-metric-detail">{stats.accepted} accepted · {stats.rejected} rejected</span>
        </div>
        <div className="analytics-metric-card">
          <span className="analytics-metric-label">Target accuracy</span>
          <strong className="analytics-metric-value">{formatPercentage(targetHitRate)}</strong>
          <span className="analytics-metric-detail">Accepted outputs inside their safe target range</span>
        </div>
        <div className="analytics-metric-card">
          <span className="analytics-metric-label">Average API time</span>
          <strong className="analytics-metric-value">{formatTime(averageLatency)}</strong>
          <span className="analytics-metric-detail">Across {formatNumber(stats.requests)} compression requests</span>
        </div>
      </section>

      {stats.requests === 0 ? (
        <Card className="analytics-empty-card">
          <CardContent>
            <div className="analytics-empty-icon">📈</div>
            <h3>No session data yet</h3>
            <p className="text-muted m-0">Run a compression to see reduction, safety, target, and provider metrics here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="analytics-grid">
          <Card className="analytics-span-2">
            <CardHeader title="Token efficiency" />
            <CardContent>
              <div className="token-flow" aria-label={`${formatPercentage(outputReduction)} of input tokens removed`}>
                <div className="token-flow-remaining" style={{ width: `${Math.max(0, 100 - outputReduction)}%` }}>
                  <span>Output {formatNumber(stats.compressedTokens)}</span>
                </div>
                <div className="token-flow-saved" style={{ width: `${outputReduction}%` }}>
                  {outputReduction >= 13 && <span>Saved</span>}
                </div>
              </div>
              <div className="token-flow-legend">
                <span><i className="legend-dot legend-dot-remaining" /> Input: {formatNumber(stats.originalTokens)} tokens</span>
                <span><i className="legend-dot legend-dot-saved" /> Gross saved: {formatNumber(stats.grossTokensSaved)} tokens</span>
                <span className={stats.netSavings >= 0 ? 'text-success' : 'text-warning'}>Net: {formatNumber(stats.netSavings)} tokens</span>
              </div>
              <p className="analytics-caption">Gross reduction measures the smaller prompt; net savings also includes the tokens used to run cloud compression.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Provider mix" />
            <CardContent>
              {providerEntries.length === 0 ? <p className="text-muted m-0">No providers used yet.</p> : (
                <div className="provider-list">
                  {providerEntries.map(([provider, count]) => (
                    <div className="provider-row" key={provider}>
                      <Badge variant={provider === 'groq' ? 'warning' : 'primary'}>{provider}</Badge>
                      <span>{count} request{count === 1 ? '' : 's'}</span>
                      <strong>{formatPercentage(rate(count, stats.requests))}</strong>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="analytics-span-2">
            <CardHeader title="Reduction target performance" />
            <CardContent>
              <div className="target-performance-list">
                {targetKeys.map((target) => {
                  const definition = COMPRESSION_TARGETS[target];
                  const targetStats = stats.targets[target];
                  const averageReduction = rate(targetStats.grossTokensSaved, targetStats.originalTokens);
                  const hitRate = rate(targetStats.targetHits, targetStats.accepted);
                  return (
                    <div className="target-performance-row" key={target}>
                      <div className="target-performance-copy">
                        <strong>{definition.label}</strong>
                        <span>Aim {formatPercentage(definition.targetReductionRatio * 100)}</span>
                      </div>
                      <div className="target-meter" aria-label={`${definition.label} average reduction ${formatPercentage(averageReduction)}`}>
                        <span className="target-meter-fill" style={{ width: `${Math.min(100, averageReduction)}%` }} />
                      </div>
                      <div className="target-performance-value">
                        <strong>{targetStats.requests ? formatPercentage(averageReduction) : '—'}</strong>
                        <span>{targetStats.accepted ? `${formatPercentage(hitRate)} on target` : 'No accepted results'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Quality guardrails" />
            <CardContent>
              <div className="quality-stat">
                <span>Verification rejects</span>
                <strong>{stats.rejected}</strong>
              </div>
              <div className="quality-stat">
                <span>Cloud candidates</span>
                <strong>{stats.tiers.cloud_ai || 0}</strong>
              </div>
              <div className="quality-stat">
                <span>Deterministic candidates</span>
                <strong>{(stats.tiers.tier0 || 0) + (stats.tiers.deterministic || 0)}</strong>
              </div>
              <div className="quality-stat" title="Accepted results outside target range (Safe Result Mode ON)">
                <span>Safe fallbacks</span>
                <strong>{stats.safeFallbacks}</strong>
              </div>
              <div className="quality-stat" title="Accepted unverified results (Force Target Mode)">
                <span>Forced outputs</span>
                <strong>{stats.forcedOutputs}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="analytics-span-full">
            <CardHeader title="Recent compression activity" />
            <CardContent>
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Target</th>
                      <th>Reduction</th>
                      <th>Tokens</th>
                      <th>Safety</th>
                      <th>Provider</th>
                      <th>Fallback</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.history.map((item) => (
                      <tr key={item.id}>
                        <td><Badge variant={item.accepted ? 'success' : 'error'}>{item.accepted ? (item.forcedTargetResult ? 'Forced' : 'Accepted') : 'Rejected'}</Badge></td>
                        <td>
                          {COMPRESSION_TARGETS[item.target].label}
                          {!item.safeResultMode && <span className="text-warning text-sm" style={{ marginLeft: 4 }} title="Force Target Mode">⚡</span>}
                        </td>
                        <td>{item.accepted ? `${formatPercentage(item.actualReductionPercent)}${item.targetAchieved ? ' ✓' : ''}` : '—'}</td>
                        <td>{formatNumber(item.originalTokens)} → {formatNumber(item.compressedTokens)}</td>
                        <td>{item.accepted ? formatPercentage(item.safetyScore * 100) : '—'}</td>
                        <td>{item.provider}</td>
                        <td>{item.fallbackReason ? <span className="text-warning text-sm" title={item.fallbackReason}>⚠️ {item.fallbackReason === 'AI timeout' ? 'Timeout' : 'Unavailable'}</span> : '—'}</td>
                        <td>{formatTime(item.processingTimeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
