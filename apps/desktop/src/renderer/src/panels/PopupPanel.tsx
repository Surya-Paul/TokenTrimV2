import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { CompressionResult } from '@tokentrim/shared';

export const PopupPanel: React.FC = () => {
  const [originalText, setOriginalText] = useState<string>('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get text and start compression on mount
  const loadTextAndCompress = useCallback(async () => {
    try {
      // Get text from main process
      const text = await window.tokentrim.popup.getText();
      if (!text || text.trim().length === 0) {
        setError('No text found in clipboard');
        setIsLoading(false);
        return;
      }
      setOriginalText(text);

      // Compress the text
      const compressionResult = await window.tokentrim.popup.compress(text);
      setResult(compressionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTextAndCompress();
  }, [loadTextAndCompress]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.tokentrim.popup.cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus the container for keyboard navigation
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleApply = async () => {
    if (!result?.bestCandidate?.compressedText) return;
    setIsApplying(true);
    try {
      await window.tokentrim.popup.apply(result.bestCandidate.compressedText);
    } catch (err) {
      console.error('Failed to apply:', err);
    }
  };

  const handleCancel = async () => {
    await window.tokentrim.popup.cancel();
  };

  // Format token count
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  // Calculate savings percentage
  const getSavingsPercent = () => {
    if (!result || result.originalTokens === 0) return 0;
    return Math.round((result.netSavings / result.originalTokens) * 100 * 10) / 10;
  };

  const getCostSavings = () => {
    if (!result) return 0;
    return result.estimatedCostSavings;
  };

  if (error && !originalText) {
    return (
      <div className="popup-container" ref={containerRef} tabIndex={0}>
        <div className="popup-content error-state">
          <div className="popup-header">
            <span className="popup-title">✂️ TokenTrim Quick Compress</span>
            <button className="popup-close" onClick={handleCancel} aria-label="Close">✕</button>
          </div>
          <div className="popup-error">
            <span className="error-icon">⚠️</span>
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container" ref={containerRef} tabIndex={0}>
      <div className="popup-content">
        {/* Header */}
        <div className="popup-header">
          <span className="popup-title">✂️ TokenTrim Quick Compress</span>
          <button className="popup-close" onClick={handleCancel} aria-label="Close">✕</button>
        </div>

        {/* Original Text Section */}
        <div className="popup-section">
          <div className="section-header">
            <span className="section-label">ORIGINAL</span>
            <span className="section-tokens">
              {result ? formatTokens(result.originalTokens) : '—'} tokens
            </span>
          </div>
          <div className="text-preview original-text">
            {isLoading ? (
              <div className="shimmer-lines">
                <div className="shimmer-line"></div>
                <div className="shimmer-line"></div>
                <div className="shimmer-line short"></div>
              </div>
            ) : (
              <pre>{originalText || 'No text'}</pre>
            )}
          </div>
        </div>

        {/* Compressed Text Section */}
        <div className="popup-section">
          <div className="section-header">
            <span className="section-label">COMPRESSED</span>
            <div className="section-tokens-row">
              {result ? (
                <>
                  <span className="section-tokens">
                    {formatTokens(result.finalTokens)} tokens
                  </span>
                  {result.accepted && result.bestCandidate && (
                    <span className="badge badge-success badge-sm savings-badge">
                      -{getSavingsPercent()}%
                    </span>
                  )}
                  {!result.accepted && (
                    <span className="badge badge-error badge-sm">
                      Rejected
                    </span>
                  )}
                </>
              ) : (
                <span className="section-tokens">— tokens</span>
              )}
            </div>
          </div>
          <div className="text-preview compressed-text">
            {isLoading ? (
              <div className="shimmer-lines">
                <div className="shimmer-line"></div>
                <div className="shimmer-line"></div>
                <div className="shimmer-line short"></div>
              </div>
            ) : result?.bestCandidate ? (
              <pre>{result.bestCandidate.compressedText}</pre>
            ) : result?.rejectionReason ? (
              <div className="rejection-message">
                <span className="rejection-icon">⚠️</span>
                <span>Compression rejected: {result.rejectionReason}</span>
              </div>
            ) : (
              <pre>Compression failed</pre>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {result && result.accepted && result.bestCandidate && (
          <div className="popup-stats">
            <div className="stat-item">
              <span className="stat-value">{formatTokens(result.netSavings)}</span>
              <span className="stat-label">tokens saved</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">${getCostSavings().toFixed(4)}</span>
              <span className="stat-label">est. saved</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">{result.processingTimeMs}ms</span>
              <span className="stat-label">latency</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="popup-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCancel}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={handleApply}
            disabled={isApplying || !result?.accepted || !result?.bestCandidate}
          >
            {isApplying ? 'Applying...' : '✓ Paste Compressed'}
          </button>
        </div>
      </div>
    </div>
  );
};