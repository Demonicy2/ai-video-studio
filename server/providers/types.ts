import type { StoryboardOutput } from '../../lib/validators.ts';

export interface GenerateStoryboardInput {
  title: string;
  sourceType: 'idea' | 'script';
  sourceText: string;
  language: 'vi' | 'en' | 'mixed';
  style: string;
  targetDurationSec: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  characters: Array<{
    name: string;
    description: string;
    referenceImagePath?: string | null;
  }>;
  validationErrorFeedback?: string;
}

export interface LLMProvider {
  readonly name: string;
  generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput>;
}

export interface SubmitVideoJobInput {
  sceneId: string;
  projectId: string;
  visualPrompt: string;
  negativePrompt: string;
  cameraMotion: string;
  durationSec: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export interface VideoJobStatusResult {
  status: 'queued' | 'running' | 'done' | 'failed';
  videoUrl?: string;
  videoBuffer?: Buffer;
  error?: string;
}

export interface VideoProvider {
  readonly name: string;
  submitVideoJob(scene: SubmitVideoJobInput): Promise<string>;
  getVideoJobStatus(externalJobId: string): Promise<VideoJobStatusResult>;
}

export interface SynthesizeTTSInput {
  text: string;
  voice?: string;
  language: 'vi' | 'en';
  speed?: number;
  targetDurationSec?: number;
}

export interface SynthesizeTTSResult {
  audioBuffer: Buffer;
  format: 'wav' | 'mp3';
  durationSec: number;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(input: SynthesizeTTSInput): Promise<SynthesizeTTSResult>;
}

export interface MusicProvider {
  readonly name: string;
  generateTrack(input: { style: string; durationSec: number }): Promise<{
    audioBuffer: Buffer;
    format: 'wav' | 'mp3';
    durationSec: number;
  }>;
}

