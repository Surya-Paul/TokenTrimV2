import {
  LLMProvider,
  GenerateOptions,
  ProviderResponse,
  ProviderHealth,
  ProviderCapabilities,
  ProviderStatus,
  GroqConfig,
  ProviderType
} from '@tokentrim/shared';
import { Agent, request } from 'undici';

// ============================================================================
// Base Provider Interface
// ============================================================================

export abstract class BaseProvider implements LLMProvider {
  abstract name: string;
  abstract type: ProviderType;
  
  abstract generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse>;
  abstract healthCheck(): Promise<ProviderHealth>;
  abstract getModel(): string;
  abstract getCapabilities(): ProviderCapabilities;
  abstract estimateCost(inputTokens: number, outputTokens: number): number;
  abstract getStatus(): ProviderStatus;

  protected handleError(error: Error, provider: ProviderType): never {
    throw new Error(`[${provider}] ${error.message}`);
  }
}

// ============================================================================
// Groq Provider
// ============================================================================

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChatRequest {
  messages: GroqMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

interface GroqChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: GroqMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

export class GroqProvider extends BaseProvider {
  name = 'Groq';
  type = 'groq' as ProviderType;
  
  private config: GroqConfig;
  private status: ProviderStatus = 'unavailable';
  private lastHealthCheck = 0;
  private healthCheckCache: ProviderHealth | null = null;
  private circuitBreakerState: {
    failures: number;
    lastFailure: number;
    open: boolean;
  } = { failures: 0, lastFailure: 0, open: false };
  private agent: Agent;

  constructor(config: GroqConfig) {
    super();
    this.config = {
      baseUrl: 'https://api.groq.com/openai/v1',
      ...config
    };
    // Force IPv4 — works around local IPv6 routing quirk where undici hangs instead of falling back
    this.agent = new Agent({ 
      connect: { family: 4 },
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 60_000
    });
  }

  async destroy(): Promise<void> {
    await this.agent.close();
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    if (this.circuitBreakerState.open) {
      const timeSinceFailure = Date.now() - this.circuitBreakerState.lastFailure;
      if (timeSinceFailure > 60000) { // 1 minute cooldown
        this.circuitBreakerState.open = false;
        this.circuitBreakerState.failures = 0;
      } else {
        const remainingSec = Math.ceil((60000 - timeSinceFailure) / 1000);
        throw new Error(`Groq circuit breaker open - retry in ${remainingSec}s`);
      }
    }

    const messages: GroqMessage[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const requestBody: GroqChatRequest = {
      messages,
      model: this.config.model,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens,
      stop: options.stopSequences,
      stream: false,
      response_format: options.responseFormat === 'json' ? { type: 'json_object' } : undefined
    };

    // Use external signal if provided (for overall deadline)
    const controller = options.signal 
      ? new AbortController()
      : null;
    
    // If external signal provided, listen for it
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller!.abort());
    }
    
    // Local timeout controller for per-request timeout
    console.log('[Groq] Using timeoutMs:', this.config.timeoutMs);
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.config.timeoutMs);
    
    // Combine signals - abort if either fires
    // Only include external signal if it was provided (controller is not null)
    const signals = [timeoutController.signal];
    if (controller) {
      signals.push(controller.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      console.log(`[Groq] START attempt=${attempt + 1}/${this.config.maxRetries + 1} model=${this.config.model} level=${options.metadata?.['level'] ?? 'unknown'} candidate=${options.metadata?.['candidateIndex'] ?? 'unknown'}`);
      try {
        const { body, statusCode, headers } = await request(
          `${this.config.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: combinedSignal,
            dispatcher: this.agent
          }
        );

        clearTimeout(timeoutId);

        if (!statusCode || statusCode >= 400) {
          const errorText = await body.text();
          
          if (statusCode === 401) {
            this.status = 'error';
            console.error('[Groq] FAIL', { attempt: attempt + 1, status: 401, error: errorText, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
            throw new Error('Invalid Groq API key');
          }
          
          if (statusCode === 429) {
            this.status = 'rate_limited';
            const retryAfter = headers['retry-after'];
            const retryAfterValue = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
            const delay = retryAfterValue ? parseInt(retryAfterValue) * 1000 : this.config.retryDelayMs * Math.pow(2, attempt);
            console.error('[Groq] FAIL', { attempt: attempt + 1, status: 429, error: errorText, retryAfterHeader: retryAfterValue, delayMs: delay, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
            await this.sleep(delay);
            lastError = new Error(`Rate limited: ${errorText}`);
            continue;
          }
          
          if (statusCode && statusCode >= 500) {
            this.status = 'unavailable';
            const backoffMs = this.config.retryDelayMs * Math.pow(2, attempt);
            console.error('[Groq] FAIL', { attempt: attempt + 1, status: statusCode, error: errorText, backoffMs, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
            await this.sleep(backoffMs);
            lastError = new Error(`Server error: ${statusCode} ${errorText}`);
            continue;
          }
          
          console.error('[Groq] FAIL', { attempt: attempt + 1, status: statusCode, error: errorText, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
          throw new Error(`Groq API error: ${statusCode} ${errorText}`);
        }

        const data = (await body.json()) as GroqChatResponse;
        
        // Success - reset circuit breaker
        this.circuitBreakerState.failures = 0;
        this.circuitBreakerState.open = false;
        this.status = 'available';
        
        return {
          text: data.choices[0]?.message?.content || '',
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          model: this.config.model,
          finishReason: data.choices[0]?.finish_reason === 'length' ? 'length' : 'stop',
          metadata: {
            groqId: data.id,
            totalTokens: data.usage.total_tokens
          }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (error instanceof Error && error.name === 'AbortError') {
          if (controller?.signal.aborted) {
            lastError = new Error('Global compression timeout');
            console.error('[Groq] FAIL', { attempt: attempt + 1, error: 'global timeout', isTimeout: true, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
            throw lastError; // Do not retry if the overall deadline passed
          } else {
            lastError = new Error('Groq request timeout');
            console.error('[Groq] FAIL', { attempt: attempt + 1, error: 'request timeout', isTimeout: true, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
          }
        } else {
          console.error('[Groq] FAIL', { attempt: attempt + 1, error: lastError.message, isTimeout: false, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
        }
        
        // Don't retry on certain errors
        if (lastError.message.includes('Invalid Groq API key')) {
          throw lastError;
        }
        
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    // All retries failed
    this.circuitBreakerState.failures++;
    this.circuitBreakerState.lastFailure = Date.now();
    
    if (this.circuitBreakerState.failures >= 5) {
      this.circuitBreakerState.open = true;
      this.status = 'unavailable';
    }
    
    console.error('[Groq] FAIL FINAL', { totalAttempts: this.config.maxRetries + 1, finalError: lastError?.message, circuitBreakerFailures: this.circuitBreakerState.failures, circuitBreakerOpen: this.circuitBreakerState.open, level: options.metadata?.['level'], candidateIndex: options.metadata?.['candidateIndex'] });
    throw lastError || new Error('Groq generation failed after retries');
  }

  async healthCheck(): Promise<ProviderHealth> {
    const now = Date.now();
    
    if (this.healthCheckCache && now - this.lastHealthCheck < 30000) {
      return this.healthCheckCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const start = Date.now();
      const { body, statusCode } = await request(
        `${this.config.baseUrl}/models`,
        {
          headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
          signal: controller.signal,
          dispatcher: this.agent
        }
      );
      clearTimeout(timeoutId);
      
      const latencyMs = Date.now() - start;
      
      if (!statusCode || statusCode >= 400) {
        if (statusCode === 401) {
          this.status = 'error';
        } else if (statusCode === 429) {
          this.status = 'rate_limited';
        } else {
          this.status = 'unavailable';
        }
        throw new Error(`HTTP ${statusCode}`);
      }

      const data = (await body.json()) as GroqModelsResponse;
      const modelAvailable = data.data.some(m => m.id === this.config.model);

      if (modelAvailable) {
        this.status = 'available';
      } else {
        this.status = 'unavailable';
      }
      
      this.healthCheckCache = {
        healthy: modelAvailable,
        latencyMs,
        modelAvailable,
        lastChecked: now
      };
      
      this.lastHealthCheck = now;
      return this.healthCheckCache;
    } catch (error) {
      this.healthCheckCache = {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        modelAvailable: false,
        lastChecked: now
      };
      
      this.lastHealthCheck = now;
      return this.healthCheckCache;
    }
  }

  getModel(): string {
    return this.config.model;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: true,
      jsonMode: true,
      functionCalling: true,
      maxContextTokens: 32768,
      supportedModels: [this.config.model]
    };
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return 0; // Disabled until dynamic pricing feed is implemented
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  async listModels(): Promise<string[]> {
    try {
      const { body, statusCode } = await request(
        `${this.config.baseUrl}/models`,
        {
          headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
          dispatcher: this.agent
        }
      );
      if (!statusCode || statusCode >= 400) return [];
      const data = (await body.json()) as GroqModelsResponse;
      return data.data.map(m => m.id);
    } catch {
      return [];
    }
  }

  updateConfig(config: Partial<GroqConfig>): void {
    this.config = { ...this.config, ...config };
    this.healthCheckCache = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

export interface ProviderFactoryOptions {
  groq?: GroqConfig;
}

export class ProviderFactory {
  private groqProvider: GroqProvider | null = null;

  createProviders(options: ProviderFactoryOptions): { groq?: GroqProvider } {
    const providers: { groq?: GroqProvider } = {};
    
    if (options.groq) {
      this.groqProvider = new GroqProvider(options.groq);
      providers.groq = this.groqProvider;
    }
    
    return providers;
  }

  getGroqProvider(): GroqProvider | null {
    return this.groqProvider;
  }

  getAllProviders(): LLMProvider[] {
    return [this.groqProvider].filter(Boolean) as LLMProvider[];
  }
}