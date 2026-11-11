import type { SynthesizeTTSInput, SynthesizeTTSResult, TTSProvider } from './types.ts';
import { ProviderError, withRetryAndTimeout } from './errors.ts';

/**
 * ElevenLabs Multilingual v2 TTS Provider (supports both Vietnamese 'vi' and English 'en').
 */
export class ElevenLabsTTSProvider implements TTSProvider {
  public readonly name = 'elevenlabs-tts';
  private apiKey: string;
  private voiceIdVi: string;
  private voiceIdEn: string;

  constructor(opts?: { apiKey?: string; voiceIdVi?: string; voiceIdEn?: string }) {
    this.apiKey = opts?.apiKey || process.env.ELEVENLABS_API_KEY || '';
    this.voiceIdVi = opts?.voiceIdVi || process.env.ELEVENLABS_VOICE_ID_VI || '21m00Tcm4TlvDq8ikWAM';
    this.voiceIdEn = opts?.voiceIdEn || process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM';
  }

  async synthesize(input: SynthesizeTTSInput): Promise<SynthesizeTTSResult> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'ELEVENLABS_API_KEY is not configured',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    const voiceId = input.voice || (input.language === 'vi' ? this.voiceIdVi : this.voiceIdEn);

    return await withRetryAndTimeout(
      async (signal) => {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: input.text,
            model_id: 'eleven_multilingual_v2',
            language_code: input.language,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              speed: input.speed || 1.0,
            },
          }),
          signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`ElevenLabs HTTP ${res.status}: ${text}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);
        const estimatedSec = input.targetDurationSec || Math.max(2, Math.ceil(input.text.split(/\s+/).length / 2.8));

        return {
          audioBuffer,
          format: 'mp3',
          durationSec: estimatedSec,
        };
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 30000 }
    );
  }
}

/**
 * OpenAI TTS Provider (`tts-1` / `gpt-4o-mini-tts` supports multilingual input including Vietnamese & English).
 */
export class OpenAITTSProvider implements TTSProvider {
  public readonly name = 'openai-tts';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = (opts?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = opts?.model || process.env.OPENAI_TTS_MODEL || 'tts-1';
  }

  async synthesize(input: SynthesizeTTSInput): Promise<SynthesizeTTSResult> {
    if (!this.apiKey) {
      throw new ProviderError({
        message: 'OPENAI_API_KEY is not configured for TTS',
        code: 'AUTH_ERROR',
        provider: this.name,
        retryable: false,
        statusCode: 401,
      });
    }

    return await withRetryAndTimeout(
      async (signal) => {
        const res = await fetch(`${this.baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: input.text,
            voice: input.voice || (input.language === 'vi' ? 'nova' : 'alloy'),
            speed: input.speed || 1.0,
            response_format: 'mp3',
          }),
          signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`OpenAI TTS HTTP ${res.status}: ${text}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }

        const arrayBuf = await res.arrayBuffer();
        return {
          audioBuffer: Buffer.from(arrayBuf),
          format: 'mp3',
          durationSec: input.targetDurationSec || Math.max(2, Math.ceil(input.text.split(/\s+/).length / 2.8)),
        };
      },
      { providerName: this.name, maxRetries: 3, timeoutMs: 30000 }
    );
  }
}

