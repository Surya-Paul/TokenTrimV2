import dotenv from 'dotenv';
import { z } from 'zod';
import type { TargetModel } from '@tokentrim/shared';

// Load env vars
dotenv.config();

/**
 * Parse a human-readable byte-size string (e.g. "1mb", "500kb") into bytes.
 * Throws on invalid input so the server fails fast at startup.
 */
function parseByteSize(value: string): number {
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    throw new Error(
      `Invalid REQUEST_SIZE_LIMIT: "${value}". ` +
      'Expected a number followed by a unit (b, kb, mb, gb). Examples: "1mb", "500kb", "2gb".'
    );
  }
  const num = parseFloat(match[1]!);
  const unit = match[2] ?? 'b';
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  const bytes = Math.floor(num * multipliers[unit]!);
  if (bytes <= 0) {
    throw new Error(`REQUEST_SIZE_LIMIT must be greater than 0. Got: "${value}".`);
  }
  return bytes;
}

const EnvSchema = z.object({
  // Groq Config
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required').optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3.8-27b'),
  
  // Server Config
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
  // Limits
  REQUEST_SIZE_LIMIT: z.string().default('1mb'),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(8000),
  RATE_LIMIT_MAX: z.coerce.number().default(30), // per minute
  
  // App Config
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TARGET_MODEL: z.string().default('gpt-4') as z.ZodType<TargetModel>,
  API_AUTH_TOKEN: z.string().optional(),
});

let cachedConfig: z.infer<typeof EnvSchema> | null = null;

/**
 * Get validated config, lazily evaluating on first call.
 * Throws if GROQ_API_KEY is missing when required (production).
 */
export function getConfig(): z.infer<typeof EnvSchema> {
  if (cachedConfig) return cachedConfig;
  
  const envConfig = EnvSchema.parse(process.env);
  
  // In production, require GROQ_API_KEY
  if (envConfig.NODE_ENV === 'production' && !envConfig.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required in production');
  }
  
  cachedConfig = envConfig;
  return cachedConfig;
}

/** Parsed REQUEST_SIZE_LIMIT in bytes, validated on first call. */
export function getBodySizeBytes(): number {
  return parseByteSize(getConfig().REQUEST_SIZE_LIMIT);
}
