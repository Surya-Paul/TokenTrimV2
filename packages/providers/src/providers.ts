import {
  LLMProvider,
  GenerateOptions,
  ProviderResponse,
  ProviderHealth,
  ProviderCapabilities,
  ProviderStatus,
  OllamaConfig,
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
// Ollama Provider
// ============================================================================

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
    num_ctx?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

export class OllamaProvider extends BaseProvider {
  name = 'Ollama';
  type = 'ollama' as ProviderType;
  
  private config: OllamaConfig;
  private status: ProviderStatus = 'unavailable';
  private lastHealthCheck = 0;
  private healthCheckCache: ProviderHealth | null = null;

  constructor(config: OllamaConfig) {
    super();
    this.config = config;
  }

  async generate(prompt: string, options: GenerateOptions): Promise<ProviderResponse> {
    const requestBody: OllamaGenerateRequest = {
      model: this.config.model,
      prompt,
      system: options.systemPrompt,
      stream: false,
      format: options.responseFormat === 'json' ? 'json' : undefined,
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens,
        stop: options.stopSequences
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as OllamaGenerateResponse;

      return {
        text: data.response,
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        model: this.config.model,
        finishReason: data.done ? 'stop' : 'length',
        metadata: {
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Ollama request timeout');
      }
      throw error;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const now = Date.now();
    
    // Cache health check for 30 seconds
    if (this.healthCheckCache && now - this.lastHealthCheck < 30000) {
      return this.healthCheckCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const start = Date.now();
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const latencyMs = Date.now() - start;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const modelName = this.config.model || '';
      const modelAvailable = data.models.some(m => m.name.startsWith(modelName.split(':')[0] || ''));

      this.status = modelAvailable ? 'available' : 'unavailable';
      
      this.healthCheckCache = {
        healthy: modelAvailable,
        latencyMs,
        modelAvailable,
        lastChecked: now
      };
      
      this.lastHealthCheck = now;
      return this.healthCheckCache;
    } catch (error) {
      this.status = 'unavailable';
      
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
      functionCalling: false,
      maxContextTokens: 8192,
      supportedModels: ['phi4-mini', 'phi3', 'llama3', 'mistral', 'gemma', 'qwen']
    };
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // Local inference - no monetary cost
    return 0;
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      const data = (await response.json()) as OllamaTagsResponse;
      return data.models.map(m => m.name);
    } catch {
      return [];
    }
  }

  updateConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
    this.healthCheckCache = null;
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
    this.config = config;
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

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
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

      this.status = 'available';
      
      this.healthCheckCache = {
        healthy: true,
        latencyMs,
        modelAvailable: true,
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
      supportedModels: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
    };
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // Groq pricing (approximate, per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
      'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
      'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
      'gemma2-9b-it': { input: 0.15, output: 0.15 }
    };
    
    const modelPricing = pricing[this.config.model] || { input: 0.1, output: 0.1 };
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1_000_000;
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
  ollama?: OllamaConfig;
  groq?: GroqConfig;
}

export class ProviderFactory {
  private ollamaProvider: OllamaProvider | null = null;
  private groqProvider: GroqProvider | null = null;

  createProviders(options: ProviderFactoryOptions): { ollama?: OllamaProvider; groq?: GroqProvider } {
    const providers: { ollama?: OllamaProvider; groq?: GroqProvider } = {};
    
    if (options.ollama) {
      this.ollamaProvider = new OllamaProvider(options.ollama);
      providers.ollama = this.ollamaProvider;
    }
    
    if (options.groq) {
      this.groqProvider = new GroqProvider(options.groq);
      providers.groq = this.groqProvider;
    }
    
    return providers;
  }

  getOllamaProvider(): OllamaProvider | null {
    return this.ollamaProvider;
  }

  getGroqProvider(): GroqProvider | null {
    return this.groqProvider;
  }

  getAllProviders(): LLMProvider[] {
    return [this.ollamaProvider, this.groqProvider].filter(Boolean) as LLMProvider[];
  }
}