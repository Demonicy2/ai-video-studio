import type { GenerateStoryboardInput, LLMProvider } from './types.ts';
import type { StoryboardOutput } from '../../lib/validators.ts';
import { buildStoryboardSystemPrompt } from '../pipeline/storyboard.ts';
import { ProviderError, withRetryAndTimeout } from './errors.ts';

function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('Model response did not contain a JSON object');
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  public readonly name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string; providerLabel?: string }) {
    this.name = opts?.providerLabel || 'openai-llm';
    this.apiKey = opts?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = (opts?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = opts?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput> {
    if (!this.apiKey && !this.baseUrl.includes('11434') && !this.baseUrl.includes('localhost')) {
      throw new ProviderError({
        message: 'OPENAI_API_KEY is not configured',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    const systemPrompt = buildStoryboardSystemPrompt(input);
    const userPrompt = `Project Title: ${input.title}\nSource Type: ${input.sourceType}\nLanguage: ${input.language}\nStyle: ${input.style}\nAspect Ratio: ${input.aspectRatio}\nTarget Duration: ${input.targetDurationSec}s\n\nContent:\n${input.sourceText}`;

    return await withRetryAndTimeout(
      async (signal) => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            response_format: { type: 'json_object' },
            temperature: 0.4,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
          signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const err = new Error(`HTTP ${res.status}: ${errText}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new ProviderError({
            message: 'Empty completion content from OpenAI-compatible API',
            code: 'INVALID_RESPONSE',
            provider: this.name,
            retryable: true,
          });
        }

        return extractJsonObject(content) as StoryboardOutput;
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 45000 }
    );
  }
}

export class GeminiLLMProvider implements LLMProvider {
  public readonly name = 'gemini-llm';
  private apiKey: string;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = opts?.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'GEMINI_API_KEY is not configured',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    const systemPrompt = buildStoryboardSystemPrompt(input);
    const userPrompt = `Project Title: ${input.title}\nSource Type: ${input.sourceType}\nLanguage: ${input.language}\nStyle: ${input.style}\nAspect Ratio: ${input.aspectRatio}\nTarget Duration: ${input.targetDurationSec}s\n\nContent:\n${input.sourceText}`;

    return await withRetryAndTimeout(
      async (signal) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: 'application/json',
            },
          }),
          signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const err = new Error(`Gemini HTTP ${res.status}: ${errText}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new ProviderError({
            message: 'Empty response from Gemini API',
            code: 'INVALID_RESPONSE',
            provider: this.name,
            retryable: true,
          });
        }

        return extractJsonObject(text) as StoryboardOutput;
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 45000 }
    );
  }
}

export class AnthropicLLMProvider implements LLMProvider {
  public readonly name = 'anthropic-llm';
  private apiKey: string;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = opts?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  }

  async generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'ANTHROPIC_API_KEY is not configured',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    const systemPrompt = buildStoryboardSystemPrompt(input);
    const userPrompt = `Create the JSON storyboard for:\nTitle: ${input.title}\nLanguage: ${input.language}\nStyle: ${input.style}\nAspect Ratio: ${input.aspectRatio}\nTarget Duration: ${input.targetDurationSec}s\nIdea/Script:\n${input.sourceText}`;

    return await withRetryAndTimeout(
      async (signal) => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const err = new Error(`HTTP ${res.status}: ${errText}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const textBlock = data.content?.find((c) => c.type === 'text')?.text;
        if (!textBlock) {
          throw new ProviderError({
            message: 'Empty response from Anthropic API',
            code: 'INVALID_RESPONSE',
            provider: this.name,
            retryable: true,
          });
        }

        return extractJsonObject(textBlock) as StoryboardOutput;
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 45000 }
    );
  }
}
