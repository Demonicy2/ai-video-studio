import fs from 'node:fs';
import path from 'node:path';

export interface RuntimeProviderSettings {
  llmProvider: 'smart-local' | 'ollama' | 'gemini' | 'openai' | 'anthropic' | 'mock';
  videoProvider: 'cinema-canvas' | 'veo' | 'mock';
  ttsProvider: 'neural-free' | 'elevenlabs' | 'openai' | 'mock';
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiApiKey: string;
  geminiModel: string;
  veoModel: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceVi: string;
  elevenlabsVoiceEn: string;
}

const SETTINGS_FILE = path.resolve(process.cwd(), 'storage', 'provider-settings.json');

function loadSavedSettings(): Partial<RuntimeProviderSettings> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

export function getRuntimeSettings(): RuntimeProviderSettings {
  const saved = loadSavedSettings();
  return {
    llmProvider:
      saved.llmProvider ||
      ((process.env.LLM_PROVIDER as RuntimeProviderSettings['llmProvider']) || 'smart-local'),
    videoProvider:
      saved.videoProvider ||
      ((process.env.VIDEO_PROVIDER as RuntimeProviderSettings['videoProvider']) || 'cinema-canvas'),
    ttsProvider:
      saved.ttsProvider ||
      ((process.env.TTS_PROVIDER as RuntimeProviderSettings['ttsProvider']) || 'neural-free'),
    ollamaBaseUrl: saved.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    ollamaModel: saved.ollamaModel || process.env.OLLAMA_MODEL || 'llama3.2',
    geminiApiKey: saved.geminiApiKey || process.env.GEMINI_API_KEY || '',
    geminiModel: saved.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    veoModel: saved.veoModel || process.env.VEO_MODEL || 'veo-2.0-generate-001',
    openaiApiKey: saved.openaiApiKey || process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: saved.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: saved.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    anthropicApiKey: saved.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: saved.anthropicModel || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    elevenlabsApiKey: saved.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoiceVi:
      saved.elevenlabsVoiceVi || process.env.ELEVENLABS_VOICE_ID_VI || '21m00Tcm4TlvDq8ikWAM',
    elevenlabsVoiceEn:
      saved.elevenlabsVoiceEn || process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM',
  };
}

export function updateRuntimeSettings(patch: Partial<RuntimeProviderSettings>): RuntimeProviderSettings {
  const current = getRuntimeSettings();
  const next: RuntimeProviderSettings = { ...current, ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function getPublicRuntimeSettings() {
  const s = getRuntimeSettings();
  return {
    llmProvider: s.llmProvider,
    videoProvider: s.videoProvider,
    ttsProvider: s.ttsProvider,
    ollamaBaseUrl: s.ollamaBaseUrl,
    ollamaModel: s.ollamaModel,
    geminiModel: s.geminiModel,
    veoModel: s.veoModel,
    openaiBaseUrl: s.openaiBaseUrl,
    openaiModel: s.openaiModel,
    anthropicModel: s.anthropicModel,
    hasGeminiKey: Boolean(s.geminiApiKey),
    hasOpenaiKey: Boolean(s.openaiApiKey),
    hasAnthropicKey: Boolean(s.anthropicApiKey),
    hasElevenlabsKey: Boolean(s.elevenlabsApiKey),
  };
}
