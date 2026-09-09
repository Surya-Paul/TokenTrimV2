import {
  AnalyticsData,
  ProviderAnalytics,
  ContentTypeAnalytics,
  ProviderType,
  ContentType,
  CompressionResult
} from '@tokentrim/shared';

interface StoredAnalytics extends AnalyticsData {
  version: number;
  lastUpdated: number;
}

const STORAGE_KEY = 'tokentrim_analytics';
const CURRENT_VERSION = 1;

// Stub localStorage for Node.js environments
const getLocalStorage = () => {
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
};

export class Telemetry {
  private enabled: boolean;
  private data: AnalyticsData;
  private sessionStart: number;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.sessionStart = Date.now();
    this.data = this.loadAnalytics();
  }

  private loadAnalytics(): AnalyticsData {
    if (!this.enabled) {
      return this.getDefaultAnalytics();
    }

    try {
      const stored = getLocalStorage().getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredAnalytics = JSON.parse(stored);
        if (parsed.version === CURRENT_VERSION) {
          return this.migrateAnalytics(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }

    return this.getDefaultAnalytics();
  }

  private migrateAnalytics(data: StoredAnalytics): AnalyticsData {
    // Handle version migrations here
    return {
      totalPrompts: data.totalPrompts || 0,
      totalOriginalTokens: data.totalOriginalTokens || 0,
      totalOptimizedTokens: data.totalOptimizedTokens || 0,
      grossTokensSaved: data.grossTokensSaved || 0,
      compressionOverhead: data.compressionOverhead || 0,
      netTokensSaved: data.netTokensSaved || 0,
      estimatedMoneySaved: data.estimatedMoneySaved || 0,
      localCompressionPercentage: data.localCompressionPercentage || 0,
      cloudCompressionPercentage: data.cloudCompressionPercentage || 0,
      averageLatencyMs: data.averageLatencyMs || 0,
      failureRate: data.failureRate || 0,
      cloudEscalationRate: data.cloudEscalationRate || 0,
      byProvider: data.byProvider || this.getDefaultProviderAnalytics(),
      byContentType: data.byContentType || this.getDefaultContentTypeAnalytics()
    };
  }

  private getDefaultAnalytics(): AnalyticsData {
    return {
      totalPrompts: 0,
      totalOriginalTokens: 0,
      totalOptimizedTokens: 0,
      grossTokensSaved: 0,
      compressionOverhead: 0,
      netTokensSaved: 0,
      estimatedMoneySaved: 0,
      localCompressionPercentage: 0,
      cloudCompressionPercentage: 0,
      averageLatencyMs: 0,
      failureRate: 0,
      cloudEscalationRate: 0,
      byProvider: this.getDefaultProviderAnalytics(),
      byContentType: this.getDefaultContentTypeAnalytics()
    };
  }

  private getDefaultProviderAnalytics(): Record<ProviderType, ProviderAnalytics> {
    return {
      deterministic: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 },
      ollama: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 },
      groq: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 }
    };
  }

  private getDefaultContentTypeAnalytics(): Record<ContentType, ContentTypeAnalytics> {
    const types: ContentType[] = [
      'prose', 'coding_prompt', 'code', 'logs', 'sql', 'json', 'yaml', 'xml',
      'markdown', 'terminal_commands', 'git_diff', 'tables', 'mathematical_notation',
      'urls', 'configuration_files', 'unknown'
    ];

    const result: Record<ContentType, ContentTypeAnalytics> = {} as any;
    for (const type of types) {
      result[type] = { prompts: 0, averageReduction: 0, averageNetSavings: 0 };
    }
    return result;
  }

  private saveAnalytics(): void {
    if (!this.enabled) return;

    try {
      const toStore: StoredAnalytics = {
        ...this.data,
        version: CURRENT_VERSION,
        lastUpdated: Date.now()
      };
      getLocalStorage().setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (error) {
      console.warn('[Telemetry] Failed to save analytics:', error);
    }
  }

  recordCompression(result: CompressionResult): void {
    if (!this.enabled) return;

    this.data.totalPrompts++;
    this.data.totalOriginalTokens += result.originalTokens;
    this.data.totalOptimizedTokens += result.finalTokens;
    this.data.grossTokensSaved += result.grossReduction;
    this.data.compressionOverhead += result.compressionOverhead;
    this.data.netTokensSaved += result.netSavings;
    this.data.estimatedMoneySaved += result.estimatedCostSavings;

    // Update provider analytics
    const providerStats = this.data.byProvider[result.provider];
    providerStats.prompts++;
    providerStats.originalTokens += result.originalTokens;
    providerStats.optimizedTokens += result.finalTokens;
    providerStats.netSavings += result.netSavings;
    providerStats.averageLatencyMs = 
      (providerStats.averageLatencyMs * (providerStats.prompts - 1) + result.processingTimeMs) / providerStats.prompts;
    if (!result.accepted) {
      providerStats.failureCount++;
    }

    // Update content type analytics
    // In a real implementation, we'd track this from the analysis
    // For now, we'll use a default
    const contentType = 'prose' as ContentType;
    const contentStats = this.data.byContentType[contentType];
    contentStats.prompts++;
    const reduction = result.originalTokens > 0 ? result.grossReduction / result.originalTokens : 0;
    contentStats.averageReduction = 
      (contentStats.averageReduction * (contentStats.prompts - 1) + reduction) / contentStats.prompts;
    contentStats.averageNetSavings = 
      (contentStats.averageNetSavings * (contentStats.prompts - 1) + result.netSavings) / contentStats.prompts;

    // Update derived metrics
    this.updateDerivedMetrics();

    this.saveAnalytics();
  }

  private updateDerivedMetrics(): void {
    const total = this.data.totalPrompts;
    if (total === 0) return;

    const localPrompts = this.data.byProvider.deterministic.prompts + this.data.byProvider.ollama.prompts;
    const cloudPrompts = this.data.byProvider.groq.prompts;

    this.data.localCompressionPercentage = total > 0 ? (localPrompts / total) * 100 : 0;
    this.data.cloudCompressionPercentage = total > 0 ? (cloudPrompts / total) * 100 : 0;

    const totalLatency = 
      this.data.byProvider.deterministic.averageLatencyMs * this.data.byProvider.deterministic.prompts +
      this.data.byProvider.ollama.averageLatencyMs * this.data.byProvider.ollama.prompts +
      this.data.byProvider.groq.averageLatencyMs * this.data.byProvider.groq.prompts;
    
    this.data.averageLatencyMs = total > 0 ? totalLatency / total : 0;

    const totalFailures = 
      this.data.byProvider.deterministic.failureCount +
      this.data.byProvider.ollama.failureCount +
      this.data.byProvider.groq.failureCount;
    
    this.data.failureRate = total > 0 ? (totalFailures / total) * 100 : 0;

    this.data.cloudEscalationRate = total > 0 ? (cloudPrompts / total) * 100 : 0;
  }

  getAnalytics(): AnalyticsData {
    return { ...this.data };
  }

  resetAnalytics(): void {
    this.data = this.getDefaultAnalytics();
    this.sessionStart = Date.now();
    this.saveAnalytics();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      // Clear stored data when disabled
      try {
        getLocalStorage().removeItem(STORAGE_KEY);
      } catch { /* storage unavailable */ }
    } else {
      this.data = this.loadAnalytics();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  exportAnalytics(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importAnalytics(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      this.data = this.migrateAnalytics({ ...imported, version: CURRENT_VERSION, lastUpdated: Date.now() });
      this.saveAnalytics();
      return true;
    } catch {
      return false;
    }
  }
}

// Server-side telemetry (for Node.js environments)
export class ServerTelemetry {
  private enabled: boolean;
  private data: AnalyticsData;
  private sessionStart: number;
  private storagePath: string;

  constructor(enabled: boolean = true, storagePath: string = './telemetry.json') {
    this.enabled = enabled;
    this.storagePath = storagePath;
    this.sessionStart = Date.now();
    this.data = this.loadAnalytics();
  }

  private loadAnalytics(): AnalyticsData {
    if (!this.enabled) return this.getDefaultAnalytics();

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      if (fs.existsSync(this.storagePath)) {
        const stored = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
        if (stored.version === CURRENT_VERSION) {
          return this.migrateAnalytics(stored);
        }
      }
    } catch { /* file read failed, use defaults */ }
    return this.getDefaultAnalytics();
  }

  private migrateAnalytics(data: any): AnalyticsData {
    return {
      totalPrompts: data.totalPrompts || 0,
      totalOriginalTokens: data.totalOriginalTokens || 0,
      totalOptimizedTokens: data.totalOptimizedTokens || 0,
      grossTokensSaved: data.grossTokensSaved || 0,
      compressionOverhead: data.compressionOverhead || 0,
      netTokensSaved: data.netTokensSaved || 0,
      estimatedMoneySaved: data.estimatedMoneySaved || 0,
      localCompressionPercentage: data.localCompressionPercentage || 0,
      cloudCompressionPercentage: data.cloudCompressionPercentage || 0,
      averageLatencyMs: data.averageLatencyMs || 0,
      failureRate: data.failureRate || 0,
      cloudEscalationRate: data.cloudEscalationRate || 0,
      byProvider: data.byProvider || this.getDefaultProviderAnalytics(),
      byContentType: data.byContentType || this.getDefaultContentTypeAnalytics()
    };
  }

  private getDefaultAnalytics(): AnalyticsData {
    return {
      totalPrompts: 0,
      totalOriginalTokens: 0,
      totalOptimizedTokens: 0,
      grossTokensSaved: 0,
      compressionOverhead: 0,
      netTokensSaved: 0,
      estimatedMoneySaved: 0,
      localCompressionPercentage: 0,
      cloudCompressionPercentage: 0,
      averageLatencyMs: 0,
      failureRate: 0,
      cloudEscalationRate: 0,
      byProvider: this.getDefaultProviderAnalytics(),
      byContentType: this.getDefaultContentTypeAnalytics()
    };
  }

  private getDefaultProviderAnalytics(): Record<ProviderType, ProviderAnalytics> {
    return {
      deterministic: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 },
      ollama: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 },
      groq: { prompts: 0, originalTokens: 0, optimizedTokens: 0, netSavings: 0, averageLatencyMs: 0, failureCount: 0 }
    };
  }

  private getDefaultContentTypeAnalytics(): Record<ContentType, ContentTypeAnalytics> {
    const types: ContentType[] = [
      'prose', 'coding_prompt', 'code', 'logs', 'sql', 'json', 'yaml', 'xml',
      'markdown', 'terminal_commands', 'git_diff', 'tables', 'mathematical_notation',
      'urls', 'configuration_files', 'unknown'
    ];

    const result: Record<ContentType, ContentTypeAnalytics> = {} as any;
    for (const type of types) {
      result[type] = { prompts: 0, averageReduction: 0, averageNetSavings: 0 };
    }
    return result;
  }

  private saveAnalytics(): void {
    if (!this.enabled) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const toStore = {
        ...this.data,
        version: CURRENT_VERSION,
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(toStore, null, 2));
    } catch (error) {
      console.warn('[Telemetry] Failed to save analytics:', error);
    }
  }

  recordCompression(result: CompressionResult): void {
    if (!this.enabled) return;

    this.data.totalPrompts++;
    this.data.totalOriginalTokens += result.originalTokens;
    this.data.totalOptimizedTokens += result.finalTokens;
    this.data.grossTokensSaved += result.grossReduction;
    this.data.compressionOverhead += result.compressionOverhead;
    this.data.netTokensSaved += result.netSavings;
    this.data.estimatedMoneySaved += result.estimatedCostSavings;

    const providerStats = this.data.byProvider[result.provider];
    providerStats.prompts++;
    providerStats.originalTokens += result.originalTokens;
    providerStats.optimizedTokens += result.finalTokens;
    providerStats.netSavings += result.netSavings;
    providerStats.averageLatencyMs = 
      (providerStats.averageLatencyMs * (providerStats.prompts - 1) + result.processingTimeMs) / providerStats.prompts;
    if (!result.accepted) {
      providerStats.failureCount++;
    }

    this.updateDerivedMetrics();
    this.saveAnalytics();
  }

  private updateDerivedMetrics(): void {
    const total = this.data.totalPrompts;
    if (total === 0) return;

    const localPrompts = this.data.byProvider.deterministic.prompts + this.data.byProvider.ollama.prompts;
    const cloudPrompts = this.data.byProvider.groq.prompts;

    this.data.localCompressionPercentage = total > 0 ? (localPrompts / total) * 100 : 0;
    this.data.cloudCompressionPercentage = total > 0 ? (cloudPrompts / total) * 100 : 0;

    const totalLatency = 
      this.data.byProvider.deterministic.averageLatencyMs * this.data.byProvider.deterministic.prompts +
      this.data.byProvider.ollama.averageLatencyMs * this.data.byProvider.ollama.prompts +
      this.data.byProvider.groq.averageLatencyMs * this.data.byProvider.groq.prompts;
    
    this.data.averageLatencyMs = total > 0 ? totalLatency / total : 0;

    const totalFailures = 
      this.data.byProvider.deterministic.failureCount +
      this.data.byProvider.ollama.failureCount +
      this.data.byProvider.groq.failureCount;
    
    this.data.failureRate = total > 0 ? (totalFailures / total) * 100 : 0;
    this.data.cloudEscalationRate = total > 0 ? (cloudPrompts / total) * 100 : 0;
  }

  getAnalytics(): AnalyticsData {
    return { ...this.data };
  }

  resetAnalytics(): void {
    this.data = this.getDefaultAnalytics();
    this.sessionStart = Date.now();
    this.saveAnalytics();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }
}