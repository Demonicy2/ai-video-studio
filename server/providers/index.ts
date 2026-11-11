import type { LLMProvider, MusicProvider, TTSProvider, VideoProvider } from './types.ts';
import {
  MockLLMProvider,
  MockMusicProvider,
  MockTTSProvider,
  MockVideoProvider,
} from './mock.ts';
import { AnthropicLLMProvider, OpenAICompatibleLLMProvider } from './llm.ts';
import { GeminiVeoVideoProvider } from './video.ts';
import { ElevenLabsTTSProvider, OpenAITTSProvider } from './tts.ts';

export function getLLMProvider(): LLMProvider {
  const kind = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  if (kind === 'openai' && process.env.OPENAI_API_KEY) {
    return new OpenAICompatibleLLMProvider();
  }
  if (kind === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLLMProvider();
  }
  return new MockLLMProvider();
}

export function getVideoProvider(): VideoProvider {
  const kind = (process.env.VIDEO_PROVIDER || 'mock').toLowerCase();
  if (kind === 'veo' && process.env.GEMINI_API_KEY) {
    return new GeminiVeoVideoProvider();
  }
  return new MockVideoProvider();
}

export function getTTSProvider(): TTSProvider {
  const kind = (process.env.TTS_PROVIDER || 'mock').toLowerCase();
  if (kind === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
    return new ElevenLabsTTSProvider();
  }
  if (kind === 'openai' && process.env.OPENAI_API_KEY) {
    return new OpenAITTSProvider();
  }
  return new MockTTSProvider();
}

export function getMusicProvider(): MusicProvider {
  return new MockMusicProvider();
}

