import type { SubmitVideoJobInput, VideoJobStatusResult, VideoProvider } from './types.ts';
import { ProviderError, withRetryAndTimeout } from './errors.ts';

/**
 * Google Veo VideoProvider via Gemini API long-running operations (`predictLongRunning`).
 */
export class GeminiVeoVideoProvider implements VideoProvider {
  public readonly name = 'gemini-veo';
  private apiKey: string;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = opts?.model || process.env.VEO_MODEL || 'veo-2.0-generate-001';
  }

  async submitVideoJob(scene: SubmitVideoJobInput): Promise<string> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'GEMINI_API_KEY is not configured for Veo VideoProvider',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    return await withRetryAndTimeout(
      async (signal) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predictLongRunning?key=${this.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [
              {
                prompt: `${scene.visualPrompt}. Camera motion: ${scene.cameraMotion}.`,
              },
            ],
            parameters: {
              aspectRatio: scene.aspectRatio,
              negativePrompt: scene.negativePrompt,
              durationSeconds: Math.min(8, Math.max(5, scene.durationSec)),
              sampleCount: 1,
            },
          }),
          signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Veo submit HTTP ${res.status}: ${text}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as { name?: string };
        if (!data.name) {
          throw new ProviderError({
            message: 'Veo API did not return an operation name',
            code: 'INVALID_RESPONSE',
            provider: this.name,
            retryable: false,
          });
        }
        return data.name;
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 30000 }
    );
  }

  async getVideoJobStatus(externalJobId: string): Promise<VideoJobStatusResult> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'GEMINI_API_KEY is not configured',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    return await withRetryAndTimeout(
      async (signal) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/${externalJobId}?key=${this.apiKey}`;
        const res = await fetch(url, { method: 'GET', signal });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Veo poll HTTP ${res.status}: ${text}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          done?: boolean;
          error?: { message?: string };
          response?: {
            generateVideoResponse?: {
              generatedSamples?: Array<{ video?: { uri?: string } }>;
            };
          };
        };

        if (!data.done) {
          return { status: 'running' };
        }

        if (data.error) {
          return {
            status: 'failed',
            error: data.error.message || 'Veo video generation failed',
          };
        }

        const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!videoUri) {
          return {
            status: 'failed',
            error: 'Veo completed without returning a video URI',
          };
        }

        const sep = videoUri.includes('?') ? '&' : '?';
        return {
          status: 'done',
          videoUrl: `${videoUri}${sep}key=${this.apiKey}`,
        };
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 30000 }
    );
  }
}

