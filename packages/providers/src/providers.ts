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

  constructor(config: GroqConfig) {
    super();
    this.config = {
      baseUrl: 'https://api.groq.com/openai/v1',
      ...config
    };
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    if (this.circuitBreakerState.open) {
      const timeSinceFailure = Date.now() - this.circuitBreakerState.lastFailure;
      if (timeSinceFailure > 60000) { // 1 minute cooldown
        this.circuitBreakerState.open = false;
        this.circuitBreakerState.failures = 0;
      } else {
        throw new Error('Groq circuit breaker open - cooling down');
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

    // Use external signal if provided (for overall deadline), otherwise create local one
    const controller = options.signal 
      ? new AbortController()
      : null;
    
    // If external signal provided, listen for it
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller!.abort());
    }
    
    // Local timeout controller for per-request timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.config.timeoutMs);
    
    // Combine signals - abort if either fires
    const combinedSignal = AbortSignal.any([
      controller?.signal || AbortSignal.abort(),
      timeoutController.signal
    ]);

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      console.log(`[Groq] START attempt=${attempt + 1}/${this.config.maxRetries + 1} model=${this.config.model} level=${options.metadata?.['level'] ?? 'unknown'} candidate=${options.metadata?.['candidateIndex'] ?? 'unknown'}`);
      try {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: combinedSignal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          
          if (response.status === 401) {
            this.status = 'error';
            throw new Error('Invalid Groq API key');
          }
          
          if (response.status === 429) {
            this.status = 'rate_limited';
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.config.retryDelayMs * Math.pow(2, attempt);
            await this.sleep(delay);
            lastError = new Error(`Rate limited: ${errorText}`);
            continue;
          }
          
          if (response.status >= 500) {
            this.status = 'unavailable';
            await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt));
            lastError = new Error(`Server error: ${response.status} ${errorText}`);
            continue;
          }
          
          throw new Error(`Groq API error: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as GroqChatResponse;
        
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
          lastError = new Error('Groq request timeout');
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
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const latencyMs = Date.now() - start;
      
      if (!response.ok) {
        if (response.status === 401) {
          this.status = 'error';
        } else if (response.status === 429) {
          this.status = 'rate_limited';
        } else {
          this.status = 'unavailable';
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as GroqModelsResponse;
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
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
      });
      const data = (await response.json()) as GroqModelsResponse;
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