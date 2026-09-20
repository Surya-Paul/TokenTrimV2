import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompressionPanel } from '../panels/CompressionPanel';
import { api } from '../api/client';
import type { AppSettings } from '../settings';

vi.mock('../api/client', () => ({
  api: {
    compress: vi.fn(),
    scanPrivacy: vi.fn()
  }
}));

// Mock the Tooltip component which might use external DOM APIs
import React from 'react';

vi.mock('../components/Tooltip', () => ({
  Tooltip: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => <div data-testid="tooltip" title={content as string}>{children}</div>
}));

const mockSettings: AppSettings = {
  general: { compressionTarget: 'balanced', theme: 'system', safeResultMode: true },
  privacy: { neverSendSecrets: true, maskSecretsInLogs: true },
  targetModel: { tokenizer: 'gpt-4' },
  advanced: {
    timeouts: { groq: 30000, verification: 10000 },
    retryCount: 3,
    verificationThresholds: {
      semanticConfidence: 0.9,
      instructionConfidence: 0.9,
      technicalIntegrity: 0.9,
      privacyConfidence: 1.0,
      compressionConfidence: 0.8,
      overall: 0.9
    },
    logLevel: 'info',
    diagnostics: false
  }
};

describe('CompressionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.scanPrivacy).mockResolvedValue({ hasSecrets: false, secretTypes: [], riskLevel: 'none', secretCount: 0 });
  });

  it('renders correctly and accepts input', () => {
    render(<CompressionPanel settings={mockSettings} />);
    
    const textarea = screen.getByPlaceholderText(/Paste your prompt here/i);
    expect(textarea).toBeInTheDocument();
    
    fireEvent.change(textarea, { target: { value: 'This is a test prompt' } });
    expect(textarea).toHaveValue('This is a test prompt');
  });

  it('shows loading state during compression and clears stale results', async () => {
    // Mock the API to delay so we can see the loading state
    let resolveApi: (val: unknown) => void;
    const apiPromise = new Promise(resolve => { resolveApi = resolve; });
    vi.mocked(api.compress).mockReturnValue(apiPromise as unknown as ReturnType<typeof api.compress>);

    render(<CompressionPanel settings={mockSettings} />);
    
    // Initial state: no result
    expect(screen.queryByText(/Tokens Saved/)).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Paste your prompt here/i);
    fireEvent.change(textarea, { target: { value: 'This is a test prompt' } });
    
    const button = screen.getByRole('button', { name: /Compress Prompt/i });
    fireEvent.click(button);
    
    // Check API was called with safeResultMode
    await waitFor(() => {
      expect(api.compress).toHaveBeenCalledWith(
        expect.objectContaining({ safeResultMode: true }),
        expect.anything()
      );
    });

    // Should show loading state (disabled)
    expect(button).toBeDisabled();

    // Resolve the API call
    resolveApi!({
      success: true,
      data: {
        accepted: true,
        compressedText: 'Compressed result',
        originalTokens: 10,
        compressedTokens: 5,
        grossReduction: 5,
        compressionOverhead: 0,
        netSavings: 5,
        provider: 'groq',
        tier: 'cloud_ai',
        processingTimeMs: 100,
        safetyScores: { 
          semanticConfidence: 0.95,
          instructionConfidence: 0.95,
          technicalIntegrity: 0.95,
          privacyConfidence: 0.95,
          compressionConfidence: 0.95,
          overall: 0.95 
        }
      }
    });

    // Wait for the result to render
    await waitFor(() => {
      expect(screen.getByText('Net Savings')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Compressed result')).toBeInTheDocument();

    // Triggering compression again should clear the old result while loading
    const newApiPromise = new Promise(() => {}); // Never resolves for this test
    vi.mocked(api.compress).mockReturnValue(newApiPromise as unknown as ReturnType<typeof api.compress>);

    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));

    // Result should be hidden while loading new result
    expect(screen.queryByText('Net Savings')).not.toBeInTheDocument();
  });

  it('renders successful compression result properly', async () => {
    vi.mocked(api.compress).mockResolvedValue({
      success: true,
      data: {
        accepted: true,
        compressedText: 'Compressed text',
        originalTokens: 20,
        compressedTokens: 10,
        grossReduction: 10,
        compressionOverhead: 0,
        netSavings: 10,
        provider: 'groq',
        tier: 'cloud_ai',
        processingTimeMs: 150,
        safetyScores: { 
          semanticConfidence: 0.98,
          instructionConfidence: 0.98,
          technicalIntegrity: 0.98,
          privacyConfidence: 0.98,
          compressionConfidence: 0.98,
          overall: 0.98 
        }
      }
    });

    render(<CompressionPanel settings={mockSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'Original text' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Compressed text')).toBeInTheDocument();
    });
    
    // Check stats rendering
    expect(screen.getByText('20')).toBeInTheDocument(); // Original tokens
    expect(screen.getAllByText('10')).toHaveLength(2); // Compressed tokens and Net savings
  });

  it('renders API secret error with secret categories', async () => {
    vi.mocked(api.scanPrivacy).mockResolvedValue({
      hasSecrets: true,
      riskLevel: 'high',
      secretTypes: ['api_key', 'aws_credentials'],
      secretCount: 2
    });

    render(<CompressionPanel settings={mockSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'sk-12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Secrets detected in input/)).toBeInTheDocument();
    });
    
    // Check that the secret types are rendered as badges
    expect(screen.getByText('api_key')).toBeInTheDocument();
    expect(screen.getByText('aws_credentials')).toBeInTheDocument();
  });

  it('renders rejected compression properly (Safe Result Mode ON)', async () => {
    vi.mocked(api.compress).mockResolvedValue({
      success: true,
      data: {
        accepted: false,
        rejectionReason: 'No candidate passed verification',
        compressedText: '',
        originalTokens: 10,
        compressedTokens: 10,
        grossReduction: 0,
        compressionOverhead: 0,
        netSavings: 0,
        provider: 'deterministic',
        tier: 'tier0',
        processingTimeMs: 50,
        safetyScores: { 
          semanticConfidence: 0.5,
          instructionConfidence: 0.5,
          technicalIntegrity: 0.5,
          privacyConfidence: 0.5,
          compressionConfidence: 0.5,
          overall: 0.5 
        },
        safeResultMode: true
      }
    });

    render(<CompressionPanel settings={mockSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'Some prompt' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/No candidate passed verification/)).toBeInTheDocument();
    });
  });

  it('renders successful Force Target Mode properly', async () => {
    vi.mocked(api.compress).mockResolvedValue({
      success: true,
      data: {
        accepted: true,
        compressedText: 'Original text',
        originalTokens: 10,
        compressedTokens: 5,
        grossReduction: 5,
        compressionOverhead: 0,
        netSavings: 5,
        provider: 'deterministic',
        tier: 'tier0',
        processingTimeMs: 50,
        safetyScores: { 
          semanticConfidence: 0.9,
          instructionConfidence: 0.9,
          technicalIntegrity: 0.9,
          privacyConfidence: 0.9,
          compressionConfidence: 0.9,
          overall: 0.9 
        },
        safeResultMode: false,
        targetAchieved: true,
        forcedTargetResult: true,
        actualReductionPercent: 50,
      }
    });

    const offSettings = { ...mockSettings, general: { ...mockSettings.general, safeResultMode: false } };
    render(<CompressionPanel settings={offSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'Some prompt' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      // Force Target Mode indicator should be visible
      expect(screen.getByTitle('Safe Result Mode is off — results will always be generated to meet the target')).toBeInTheDocument();
      // Badges
      expect(screen.getByText('Force Target Mode')).toBeInTheDocument();
      expect(screen.getByText('Target met')).toBeInTheDocument();
      expect(screen.getByText(/Review required:/)).toBeInTheDocument();
      expect(screen.getByText(/potential content loss/)).toBeInTheDocument();
      expect(api.compress).toHaveBeenCalledWith(
        expect.objectContaining({ safeResultMode: false }),
        expect.anything()
      );
    });
  });

  it('renders rejected Force Target Mode properly', async () => {
    vi.mocked(api.compress).mockResolvedValue({
      success: true,
      data: {
        accepted: false,
        rejectionReason: 'Target could not be met within the accepted range.',
        compressedText: '',
        originalTokens: 10,
        compressedTokens: 10,
        grossReduction: 0,
        compressionOverhead: 0,
        netSavings: 0,
        provider: 'deterministic',
        tier: 'tier0',
        processingTimeMs: 50,
        safetyScores: { 
          semanticConfidence: 0,
          instructionConfidence: 0,
          technicalIntegrity: 0,
          privacyConfidence: 0,
          compressionConfidence: 0,
          overall: 0 
        },
        safeResultMode: false,
        targetAchieved: false,
        actualReductionPercent: 0,
      }
    });

    const offSettings = { ...mockSettings, general: { ...mockSettings.general, safeResultMode: false } };
    render(<CompressionPanel settings={offSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'Some prompt' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Target could not be met within the accepted range/)).toBeInTheDocument();
    });
  });

  it('handles copy result success/failure feedback', async () => {
    // Setup navigator.clipboard mock
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    vi.mocked(api.compress).mockResolvedValue({
      success: true,
      data: {
        accepted: true,
        compressedText: 'Result to copy',
        originalTokens: 20,
        compressedTokens: 10,
        grossReduction: 10,
        compressionOverhead: 0,
        netSavings: 10,
        provider: 'groq',
        tier: 'cloud_ai',
        processingTimeMs: 150,
        safetyScores: { 
          semanticConfidence: 0.98,
          instructionConfidence: 0.98,
          technicalIntegrity: 0.98,
          privacyConfidence: 0.98,
          compressionConfidence: 0.98,
          overall: 0.98 
        }
      }
    });

    render(<CompressionPanel settings={mockSettings} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Paste your prompt here/i), { target: { value: 'Original text' } });
    fireEvent.click(screen.getByRole('button', { name: /Compress Prompt/i }));
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Result to copy')).toBeInTheDocument();
    });

    const copyButton = screen.getByRole('button', { name: /Copy compressed result/i });
    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith('Result to copy');
    
    // Check that button text changed
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy compressed result/i })).toHaveTextContent('Copied!');
    });
  });
});
