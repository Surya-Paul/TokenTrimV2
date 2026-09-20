import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { AppSettings } from '../settings';
import { api } from '../api/client';
import { COMPRESSION_TARGETS } from '../compression-targets';
import type { ApiCompressionResponse } from '@tokentrim/shared';

export function CompressionPanel({ settings, onComplete }: { settings: AppSettings, onComplete?: (result: NonNullable<ApiCompressionResponse['data']>) => void }) {
  const [input, setInput] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [result, setResult] = useState<ApiCompressionResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretTypes, setSecretTypes] = useState<string[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCompress = async () => {
    if (!input.trim()) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setIsCompressing(true);
    setError(null);
    setResult(null);
    setSecretTypes([]);
    
    try {
      // Privacy Preflight
      if (settings.privacy.neverSendSecrets) {
        const preflight = await api.scanPrivacy({ text: input }, { signal: abortControllerRef.current.signal });
        if (preflight.hasSecrets) {
          setError('Secrets detected in input. Compression aborted to protect your privacy.');
          setSecretTypes(preflight.secretTypes || []);
          setIsCompressing(false);
          return;
        }
      }

      const response = await api.compress({
        text: input,
        targetModel: settings.targetModel.tokenizer,
        compressionTarget: settings.general.compressionTarget,
        safeResultMode: settings.general.safeResultMode
      }, { signal: abortControllerRef.current.signal });
      
      setResult(response.data);
      if (response.data && onComplete) {
        onComplete(response.data);
      }
      if (!response.data?.accepted) {
        setError(response.data?.rejectionReason || 'Compression was not accepted by verification engine.');
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'error' in err) {
        const apiErr = err as { error?: { code?: string; details?: { secretTypes?: string[] } }; message?: string };
        if (apiErr.error?.code === 'SECRETS_DETECTED') {
          setError('Secrets detected in input. Compression aborted to protect your privacy.');
          setSecretTypes(apiErr.error?.details?.secretTypes || []);
        } else {
          setError(apiErr.message || 'An error occurred during compression.');
        }
      } else if (err instanceof Error) {
        if (err.name === 'AbortError') return; // Ignore aborts
        setError(err.message);
      } else {
        setError('An unexpected error occurred during compression.');
      }
    } finally {
      setIsCompressing(false);
    }
  };

  const handleCopy = () => {
    if (result?.compressedText) {
      navigator.clipboard.writeText(result.compressedText).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }).catch(err => {
        console.error('Failed to copy', err);
      });
    }
  };

  const activeTarget = result?.compressionTarget ?? settings.general.compressionTarget;
  const targetDefinition = COMPRESSION_TARGETS[activeTarget];
  const actualReductionPercent = result?.actualReductionPercent
    ?? (result && result.originalTokens > 0 ? (result.grossReduction / result.originalTokens) * 100 : 0);
  const targetReductionPercent = result?.targetReductionPercent ?? targetDefinition.targetReductionRatio * 100;
  const netSavingsClass = result && result.netSavings >= 0 ? 'text-success' : 'text-warning';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardContent>
          <textarea
            className="textarea-field"
            placeholder="Paste your prompt here..."
            aria-label="Input prompt for compression"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isCompressing}
            style={{ minHeight: 200, marginBottom: 16 }}
            tabIndex={0}
          />
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-12">
              <span className="text-sm text-muted">
                {input.length} characters
              </span>
              {!settings.general.safeResultMode && (
                <span className="text-sm text-warning" title="Safe Result Mode is off — results will always be generated to meet the target">
                  ⚡ Force Target Mode
                </span>
              )}
            </div>
            <Button onClick={handleCompress} disabled={!input.trim() || isCompressing} loading={isCompressing}>
              Compress Prompt
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card style={{ borderColor: 'var(--color-error)' }}>
          <CardContent>
            <div className="text-error font-semibold mb-8">⚠️ {error}</div>
            {secretTypes.length > 0 && (
              <div className="flex gap-12 mt-4">
                {secretTypes.map(t => <Badge key={t} variant="error">{t}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && result.accepted && (
        <Card>
          <CardContent>
            <div className="flex justify-between items-center mb-8">
              <h3 className="m-0">Result</h3>
              <div className="flex gap-12">
                <Badge variant={result.tier === 'cloud_ai' ? 'warning' : 'primary'}>
                  {result.provider}
                </Badge>
                {!result.safeResultMode && (
                  <Badge variant="warning">Force Target Mode</Badge>
                )}
                <Badge variant={result.targetAchieved ? 'success' : 'warning'}>
                  {result.targetAchieved ? 'Target met' : (result.safeResultMode !== false ? 'Safe result' : 'Target not met')}
                </Badge>
                <Button variant="secondary" size="sm" onClick={handleCopy} aria-label="Copy compressed result">
                  {copySuccess ? 'Copied!' : 'Copy Result'}
                </Button>
              </div>
            </div>
            
            {result.forcedTargetResult && (
              <div className="text-warning text-sm" style={{ padding: 12, marginBottom: 16, border: '1px solid var(--color-warning)', borderRadius: 4, background: 'var(--color-bg)' }}>
                <strong>Review required:</strong> Force Target Mode met the requested reduction, but verification detected potential content loss.
              </div>
            )}
            
            <div className="result-metric-grid mb-8">
              <div>
                <div className="text-sm text-muted">Original Tokens</div>
                <div className="font-mono font-semibold">{result.originalTokens}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Compressed Tokens</div>
                <div className="font-mono font-semibold text-success">{result.compressedTokens}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Output Reduction</div>
                <div className="font-mono font-semibold text-success">{actualReductionPercent.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-sm text-muted">Net Savings</div>
                <div className={`font-mono font-semibold ${netSavingsClass}`}>{result.netSavings}</div>
              </div>
            </div>

            <p className="compression-target-note">
              {targetDefinition.label} target: {targetReductionPercent.toFixed(0)}% reduction. Actual: {actualReductionPercent.toFixed(1)}%.
              {!result.targetAchieved && result.safeResultMode !== false && ' The safe result retained protected requirements rather than forcing the percentage.'}
              {!result.targetAchieved && result.safeResultMode === false && ' Target could not be met within the accepted range.'}
            </p>

            <textarea
              className="textarea-field"
              aria-label="Compressed prompt result"
              value={result.compressedText}
              readOnly
              style={{ minHeight: 150 }}
              tabIndex={0}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
