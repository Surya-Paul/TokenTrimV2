import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '../components/Card';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { Select, SelectOption } from '../components/Select';
import { Badge } from '../components/Badge';
import { Tooltip } from '../components/Tooltip';
import type { CompressionResult, AppSettings, TargetModel } from '@tokentrim/shared';

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

interface CompressionPanelProps {
  settings: AppSettings | null;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

export function CompressionPanel({ settings, onSettingsChange }: CompressionPanelProps) {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [targetModel, setTargetModel] = useState<TargetModel>(settings?.targetModel.tokenizer || 'gpt-4');
  const [showDiff, setShowDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from clipboard on mount
  useEffect(() => {
    const loadFromClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setInputText(text);
        }
      } catch {
        // Clipboard API not available or permission denied
      }
    };
    loadFromClipboard();
  }, []);

  const handleCompress = useCallback(async () => {
    if (!inputText.trim() || isCompressing) return;

    setIsCompressing(true);
    setError(null);
    setResult(null);

    try {
      const compressionOptions = {
        targetModel,
        maxCompressionRatio: settings?.general.compressionTarget === 'aggressive' ? 0.5 : 
                            settings?.general.compressionTarget === 'conservative' ? 0.2 : 0.35,
        preserveFormatting: true,
        allowCloudFallback: settings?.cloud.fallbackEnabled || false,
        requireConfirmationForCloud: settings?.privacy.requireCloudConfirmation || false,
        verificationThresholds: settings?.advanced.verificationThresholds
      };

      const response = await window.tokentrim.compress({
        text: inputText,
        options: compressionOptions
      });

      setResult(response.result);
      
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
    } finally {
      setIsCompressing(false);
    }
  }, [inputText, targetModel, settings, isCompressing]);

  const handleCopyResult = async () => {
    if (result?.bestCandidate) {
      try {
        await navigator.clipboard.writeText(result.bestCandidate.compressedText);
      } catch {
        // Fallback
      }
    }
  };

  const handleApplyResult = async () => {
    if (result?.bestCandidate) {
      try {
        await navigator.clipboard.writeText(result.bestCandidate.compressedText);
        setInputText(result.bestCandidate.compressedText);
      } catch {
        // Fallback
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
    } catch {
      // Fallback
    }
  };

  const handleClear = () => {
    setInputText('');
    setResult(null);
    setError(null);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'ollama': return <Badge variant="success">LOCAL - Phi-4 Mini</Badge>;
      case 'groq': return <Badge variant="warning">CLOUD - Groq</Badge>;
      default: return <Badge variant="primary">DETERMINISTIC</Badge>;
    }
  };

  return (
    <div className="compression-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Input Side */}
      <Card>
        <CardHeader 
          title="Original Prompt"
          action={
            <div className="flex items-center gap-8">
              <Tooltip content="Paste from clipboard">
                <Button variant="ghost" size="icon" onClick={handlePaste}>📋</Button>
              </Tooltip>
              <Tooltip content="Clear input">
                <Button variant="ghost" size="icon" onClick={handleClear}>✕</Button>
              </Tooltip>
            </div>
          }
        />
        <CardContent style={{ padding: 0 }}>
          <Textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste your prompt here to optimize..."
            disabled={isCompressing}
            style={{ minHeight: 400, borderRadius: 0, border: 'none', resize: 'none' }}
          />
        </CardContent>
        <CardFooter>
          <div className="flex items-center justify-between w-full">
            <Select
              value={targetModel}
              onChange={e => setTargetModel(e.target.value as TargetModel)}
              options={TARGET_MODELS}
              style={{ width: 200 }}
            />
            <Button 
              variant="primary" 
              size="lg"
              onClick={handleCompress}
              disabled={isCompressing || !inputText.trim()}
              className="btn-block"
              style={{ maxWidth: 280 }}
            >
              {isCompressing ? 'Optimizing...' : '✂️ Optimize'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Output Side */}
      <Card>
        <CardHeader 
          title={result ? 'Optimized Prompt' : 'Result'}
          action={
            result && (
              <div className="flex items-center gap-8">
                {getProviderBadge(result.provider)}
                {result.mode === 'cloud' && <Badge variant="warning">CLOUD</Badge>}
                {result.mode === 'local' && result.provider === 'ollama' && <Badge variant="success">LOCAL</Badge>}
                {result.provider === 'deterministic' && <Badge variant="primary">TIER 0</Badge>}
              </div>
            )
          }
        />
        <CardContent style={{ padding: 0, minHeight: 400 }}>
          {result ? (
            <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }}>
              {error && (
                <div style={{ 
                  padding: '12px 16px', 
                  background: 'var(--color-error-light)', 
                  border: '1px solid var(--color-error)', 
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 16,
                  color: 'var(--color-error)',
                  fontSize: 13
                }}>
                  ⚠️ {error}
                </div>
              )}
              
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Textarea
                  value={result.bestCandidate?.compressedText || 'No compression achieved'}
                  readOnly
                  style={{ 
                    minHeight: '100%', 
                    borderRadius: 0, 
                    border: 'none', 
                    resize: 'none',
                    background: result.accepted ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              
              {result.accepted && result.bestCandidate && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                  <div className="flex flex-wrap gap-8 mb-12" style={{ fontSize: 13 }}>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">Original:</span>
                      <span className="font-mono font-semibold">{formatNumber(result.originalTokens)} tokens</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">Optimized:</span>
                      <span className="font-mono font-semibold">{formatNumber(result.finalTokens)} tokens</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">Reduction:</span>
                      <span className="font-mono font-semibold text-success">
                        -{formatNumber(result.grossReduction)} ({(result.grossReduction / result.originalTokens * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">AI Overhead:</span>
                      <span className="font-mono">{formatNumber(result.compressionOverhead)} tokens</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">NET Savings:</span>
                      <span className="font-mono font-semibold text-success">
                        {formatNumber(result.netSavings)} tokens
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted">Cost Savings:</span>
                      <span className="font-mono">${result.estimatedCostSavings.toFixed(4)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 mb-12">
                    <Tooltip content="Copy to clipboard">
                      <Button variant="secondary" onClick={handleCopyResult}>📋 Copy</Button>
                    </Tooltip>
                    <Tooltip content="Apply and copy to clipboard">
                      <Button variant="primary" onClick={handleApplyResult}>✓ Apply</Button>
                    </Tooltip>
                  </div>

                  {/* Safety Indicators */}
                  <div className="flex flex-wrap gap-4">
                    <Tooltip content="Instructions preserved">
                      <Badge variant={result.bestCandidate.safetyScores.instructionConfidence > 0.9 ? 'success' : 'warning'}>
                        Instructions: {(result.bestCandidate.safetyScores.instructionConfidence * 100).toFixed(0)}%
                      </Badge>
                    </Tooltip>
                    <Tooltip content="Constraints preserved">
                      <Badge variant={result.bestCandidate.safetyScores.technicalIntegrity > 0.95 ? 'success' : 'warning'}>
                        Technical: {(result.bestCandidate.safetyScores.technicalIntegrity * 100).toFixed(0)}%
                      </Badge>
                    </Tooltip>
                    <Tooltip content="Semantic meaning preserved">
                      <Badge variant={result.bestCandidate.safetyScores.semanticConfidence > 0.85 ? 'success' : 'warning'}>
                        Semantic: {(result.bestCandidate.safetyScores.semanticConfidence * 100).toFixed(0)}%
                      </Badge>
                    </Tooltip>
                    <Tooltip content="Privacy compliance">
                      <Badge variant={result.bestCandidate.safetyScores.privacyConfidence === 1 ? 'success' : 'warning'}>
                        Privacy: {(result.bestCandidate.safetyScores.privacyConfidence * 100).toFixed(0)}%
                      </Badge>
                    </Tooltip>
                  </div>
                </div>
              )}

              {!result.accepted && (
                <div style={{ 
                  padding: 20, 
                  background: 'var(--color-error-light)', 
                  border: '1px solid var(--color-error)', 
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, color: 'var(--color-error)' }}>
                    Compression rejected: {result.rejectionReason || 'Failed safety checks'}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Your original prompt was preserved unchanged.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              padding: 40
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✂️</div>
              <p style={{ margin: 0, fontSize: 16 }}>Enter a prompt to optimize</p>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                TokenTrim will reduce tokens while preserving intent, instructions, and technical details.
              </p>
            </div>
          )}
        </CardContent>
        {result && result.accepted && (
          <CardFooter>
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted">
                Processed in {result.processingTimeMs}ms • {result.mode === 'local' ? 'Local' : 'Cloud'} processing
              </span>
              <div className="flex items-center gap-4">
                <Tooltip content="Show token breakdown">
                  <Button variant="ghost" size="sm">Details</Button>
                </Tooltip>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}