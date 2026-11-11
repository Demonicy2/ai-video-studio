import type { LLMProvider, MusicProvider, TTSProvider, VideoProvider } from './types.ts';
import {
  MockLLMProvider,
  MockMusicProvider,
  MockTTSProvider,
  MockVideoProvider,
} from './mock.ts';
import {
  AnthropicLLMProvider,
  GeminiLLMProvider,
  OpenAICompatibleLLMProvider,
} from './llm.ts';
import { GeminiVeoVideoProvider } from './video.ts';
import {
  ElevenLabsTTSProvider,
  FreeNeuralTTSProvider,
  OpenAITTSProvider,
} from './tts.ts';
import { getRuntimeSettings } from './runtime-config.ts';

export function getLLMProvider(): LLMProvider {
  const s = getRuntimeSettings();
  const kind = s.llmProvider.toLowerCase();

  if (kind === 'gemini' && s.geminiApiKey) {
    return new GeminiLLMProvider({ apiKey: s.geminiApiKey, model: s.geminiModel });
  }
  if (kind === 'openai' && s.openaiApiKey) {
    return new OpenAICompatibleLLMProvider({
      apiKey: s.openaiApiKey,
      baseUrl: s.openaiBaseUrl,
      model: s.openaiModel,
    });
  }
  if (kind === 'anthropic' && s.anthropicApiKey) {
    return new AnthropicLLMProvider({
      apiKey: s.anthropicApiKey,
      model: s.anthropicModel,
    });
  }
  if (kind === 'ollama') {
    return new OpenAICompatibleLLMProvider({
      apiKey: 'ollama',
      baseUrl: `${s.ollamaBaseUrl.replace(/\/$/, '')}/v1`,
      model: s.ollamaModel,
      providerLabel: 'ollama-local-llm',
    });
  }
  return new MockLLMProvider();
}

export function getVideoProvider(): VideoProvider {
  const s = getRuntimeSettings();
  const kind = s.videoProvider.toLowerCase();
  if (kind === 'veo' && s.geminiApiKey) {
    return new GeminiVeoVideoProvider({ apiKey: s.geminiApiKey, model: s.veoModel });
  }
  return new MockVideoProvider();
}

export function getTTSProvider(): TTSProvider {
  const s = getRuntimeSettings();
  const kind = s.ttsProvider.toLowerCase();
  if (kind === 'elevenlabs' && s.elevenlabsApiKey) {
    return new ElevenLabsTTSProvider({
      apiKey: s.elevenlabsApiKey,
      voiceIdVi: s.elevenlabsVoiceVi,
      voiceIdEn: s.elevenlabsVoiceEn,
    });
  }
  if (kind === 'openai' && s.openaiApiKey) {
    return new OpenAITTSProvider({
      apiKey: s.openaiApiKey,
      baseUrl: s.openaiBaseUrl,
    });
  }
  if (kind === 'neural-free') {
    return new FreeNeuralTTSProvider();
  }
  return new MockTTSProvider();
}

export function getMusicProvider(): MusicProvider {
  return new MockMusicProvider();
}
