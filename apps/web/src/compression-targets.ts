import type { CompressionTarget } from '@tokentrim/shared';

export interface CompressionTargetDefinition {
  label: string;
  targetReductionRatio: number;
  minimumReductionRatio: number;
  maximumReductionRatio: number;
  description: string;
}

/**
 * Browser-safe presentation data for the API's compression-target contract.
 * This intentionally mirrors the server-side map because the shared package
 * currently ships CommonJS, while the Vite client needs an ESM runtime module.
 */
export const COMPRESSION_TARGETS: Record<CompressionTarget, CompressionTargetDefinition> = {
  conservative: {
    label: 'Conservative',
    targetReductionRatio: 0.2,
    minimumReductionRatio: 0.17,
    maximumReductionRatio: 0.23,
    description: 'Aim for 20% reduction while retaining nearly all phrasing.'
  },
  balanced: {
    label: 'Balanced',
    targetReductionRatio: 0.35,
    minimumReductionRatio: 0.3,
    maximumReductionRatio: 0.4,
    description: 'Aim for 35% reduction with concise wording.'
  },
  aggressive: {
    label: 'Aggressive',
    targetReductionRatio: 0.5,
    minimumReductionRatio: 0.45,
    maximumReductionRatio: 0.55,
    description: 'Aim for 50% reduction while preserving every requirement.'
  },
  extreme: {
    label: 'Extreme',
    targetReductionRatio: 0.75,
    minimumReductionRatio: 0.68,
    maximumReductionRatio: 0.8,
    description: 'Aim for 75% reduction; complex or protected prompts may safely reduce less.'
  }
};
