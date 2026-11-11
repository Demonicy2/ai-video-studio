import { describe, it, expect, runAllRegisteredTests } from 'vitest';
import {
  StoryboardOutputSchema,
  isDurationWithinTolerance,
  reconcileSceneDurations,
  injectCharacterDescriptions,
} from '../../lib/validators.ts';
import {
  normalizeProviderError,
  withRetryAndTimeout,
} from '../../server/providers/errors.ts';
import {
  buildNormalizeSceneFfmpegArgs,
  buildAssembleFinalFfmpegArgs,
  generateSrtContent,
  generateAssContent,
} from '../../server/ffmpeg/assembler.ts';
import { generateValidatedStoryboard } from '../../server/pipeline/storyboard.ts';
import type { LLMProvider, GenerateStoryboardInput } from '../../server/providers/types.ts';

describe('1. Storyboard Zod Validation & Retry Logic', () => {
  it('validates a well-formed storyboard with Vietnamese dialogue and English visualPrompt', () => {
    const sample = {
      title: 'Khám phá Sài Gòn 2099',
      scenes: [
        {
          index: 0,
          title: 'Cảnh 1: Mở đầu',
          narration: 'Đêm xuống trên thành phố rực rỡ ánh đèn neon.',
          dialogue: [
            {
              speaker: 'Linh',
              text: 'Chào mừng bạn đến với tương lai!',
              language: 'vi',
            },
          ],
          visualPrompt:
            'Subject: Linh (young woman in cyberpunk jacket). Action: looking over neon skyline. Setting: futuristic Saigon rooftop. Lighting: volumetric cyan and magenta neon. Camera angle: low angle wide shot. Camera motion: zoom_in. Style: anime fairy tale. Mood: awe-inspiring.',
          negativePrompt: 'blurry, low quality',
          cameraMotion: 'zoom_in',
          durationSec: 8,
        },
      ],
    };

    const parsed = StoryboardOutputSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scenes[0].dialogue[0].language).toBe('vi');
      expect(parsed.data.scenes[0].cameraMotion).toBe('zoom_in');
    }
  });

  it('rejects a storyboard when visualPrompt is too short or scenes array is empty', () => {
    const invalidSample = {
      title: 'Bad Storyboard',
      scenes: [
        {
          index: 0,
          title: 'Scene 1',
          narration: 'Short',
          dialogue: [],
          visualPrompt: 'too short',
          cameraMotion: 'static',
          durationSec: 5,
        },
      ],
    };

    const parsed = StoryboardOutputSchema.safeParse(invalidSample);
    expect(parsed.success).toBe(false);
  });

  it('retries once with validation error feedback when LLM returns invalid output on first attempt', async () => {
    let calls = 0;
    let receivedFeedback: string | undefined;

    const flakyLLM: LLMProvider = {
      name: 'flaky-test-llm',
      async generateStoryboard(input: GenerateStoryboardInput) {
        calls++;
        receivedFeedback = input.validationErrorFeedback;
        if (calls === 1) {
          // Return invalid visualPrompt (too short) on attempt 1
          return {
            title: 'Attempt 1',
            scenes: [
              {
                index: 0,
                title: 'Scene 1',
                narration: 'Test',
                dialogue: [],
                visualPrompt: 'short',
                negativePrompt: 'blurry',
                cameraMotion: 'static',
                durationSec: 15,
              },
            ],
          };
        }
        return {
          title: 'Recovered Storyboard',
          scenes: [
            {
              index: 0,
              title: 'Scene 1',
              narration: 'Xin chào thế giới',
              dialogue: [{ speaker: 'Linh', text: 'Xin chào!', language: 'vi' }],
              visualPrompt:
                'Subject: Linh. Action: waving hand. Setting: sunny park. Lighting: golden hour. Camera angle: medium shot. Camera motion: static. Style: 3D cartoon. Mood: cheerful.',
              negativePrompt: 'blurry',
              cameraMotion: 'static',
              durationSec: 15,
            },
          ],
        };
      },
    };

    const result = await generateValidatedStoryboard(flakyLLM, {
      title: 'Test Retry',
      sourceType: 'idea',
      sourceText: 'A short greeting in a park',
      language: 'vi',
      style: '3D cartoon',
      targetDurationSec: 15,
      aspectRatio: '9:16',
      characters: [{ name: 'Linh', description: 'cheerful girl in yellow raincoat' }],
    });

    expect(calls).toBe(2);
    expect(Boolean(receivedFeedback)).toBe(true);
    expect(result.title).toBe('Recovered Storyboard');
    expect(result.scenes[0].visualPrompt).toContain('cheerful girl in yellow raincoat');
  });
});

describe('2. Duration Reconciliation & Character Consistency', () => {
  it('checks ±10% tolerance accurately and reconciles out-of-range durations', () => {
    const within = [{ durationSec: 7 }, { durationSec: 8 }]; // sum = 15 (target 15)
    expect(isDurationWithinTolerance(within, 15, 0.1)).toBe(true);

    const outOfRange = [{ durationSec: 4 }, { durationSec: 4 }, { durationSec: 4 }]; // sum = 12 (target 30)
    expect(isDurationWithinTolerance(outOfRange, 30, 0.1)).toBe(false);

    const reconciled = reconcileSceneDurations(outOfRange, 30);
    const total = reconciled.reduce((acc, s) => acc + s.durationSec, 0);
    expect(total).toBe(30);
    expect(isDurationWithinTolerance(reconciled, 30, 0.1)).toBe(true);
  });

  it('injects missing character descriptions into visualPrompt', () => {
    const prompt = 'Subject: hero running through forest at dawn.';
    const updated = injectCharacterDescriptions(prompt, [
      { name: 'Kaito', description: 'silver-haired samurai wearing crimson armor' },
    ]);
    expect(updated).toContain('Kaito (silver-haired samurai wearing crimson armor)');
  });
});

describe('3. Provider Error Normalization & Exponential Backoff', () => {
  it('normalizes 429 rate-limit, 401 auth, and timeout errors into ProviderError', () => {
    const rateLimitErr = normalizeProviderError(
      Object.assign(new Error('Too Many Requests'), { status: 429 }),
      'openai-llm'
    );
    expect(rateLimitErr.code).toBe('RATE_LIMIT');
    expect(rateLimitErr.retryable).toBe(true);
    expect(rateLimitErr.statusCode).toBe(429);

    const authErr = normalizeProviderError(
      Object.assign(new Error('Invalid API key'), { status: 401 }),
      'elevenlabs-tts'
    );
    expect(authErr.code).toBe('AUTH_ERROR');
    expect(authErr.retryable).toBe(false);

    const timeoutErr = normalizeProviderError(
      new Error('Operation timed out after 30000ms'),
      'gemini-veo'
    );
    expect(timeoutErr.code).toBe('TIMEOUT');
    expect(timeoutErr.retryable).toBe(true);
  });

  it('retries transient 429 errors with exponential backoff and succeeds', async () => {
    let attempts = 0;
    const res = await withRetryAndTimeout(
      async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('429 Rate limit reached') as Error & { status?: number };
          err.status = 429;
          throw err;
        }
        return 'ok-after-retry';
      },
      { providerName: 'test-provider', maxRetries: 3, baseDelayMs: 10, timeoutMs: 2000 }
    );

    expect(res).toBe('ok-after-retry');
    expect(attempts).toBe(3);
  });
});

describe('4. FFmpeg Command Builder & Subtitle Generation', () => {
  it('builds scene normalization FFmpeg args with 1080x1920 @ 30fps, libx264, aac, and yuv420p', () => {
    const args = buildNormalizeSceneFfmpegArgs({
      videoInputPath: '/storage/scene_0.mp4',
      audioInputPath: '/storage/scene_0.wav',
      outputPath: '/storage/norm_0.mp4',
      durationSec: 6,
      resolution: { width: 1080, height: 1920, fps: 30 },
    });

    expect(args).toContain('-stream_loop');
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('yuv420p');
    expect(args).toContain('6');
    const vfArg = args[args.indexOf('-vf') + 1];
    expect(vfArg).toContain('scale=1080:1920');
    expect(vfArg).toContain('fps=30');
  });

  it('builds final assembly FFmpeg args with -12dB background music ducking, ASS subtitles, and +faststart', () => {
    const args = buildAssembleFinalFfmpegArgs({
      concatListPath: '/storage/concat.txt',
      bgMusicPath: '/storage/bgm.wav',
      assSubtitlePath: '/storage/subtitles.ass',
      burnSubtitles: true,
      outputPath: '/storage/final.mp4',
      totalDurationSec: 15,
    });

    expect(args).toContain('+faststart');
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    const filterComplex = args[args.indexOf('-filter_complex') + 1];
    expect(filterComplex).toContain('volume=-12dB');
    expect(filterComplex).toContain('amix=inputs=2');
    expect(filterComplex).toContain('subtitles.ass');
  });

  it('generates valid SRT and ASS subtitles from Vietnamese scene dialogue', () => {
    const scenes = [
      {
        sceneId: 's1',
        index: 0,
        durationSec: 5,
        videoAbsPath: '/storage/s1.mp4',
        dialogue: [{ speaker: 'Linh', text: 'Xin chào Sài Gòn!', language: 'vi' as const }],
      },
      {
        sceneId: 's2',
        index: 1,
        durationSec: 10,
        videoAbsPath: '/storage/s2.mp4',
        dialogue: [{ speaker: 'Linh', text: 'Bắt đầu hành trình mới.', language: 'vi' as const }],
      },
    ];

    const srt = generateSrtContent(scenes);
    expect(srt).toContain('00:00:00,000 --> 00:00:05,000');
    expect(srt).toContain('00:00:05,000 --> 00:00:15,000');
    expect(srt).toContain('Linh: Xin chào Sài Gòn!');

    const ass = generateAssContent(scenes, { width: 1080, height: 1920, fps: 30 });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:05.00');
  });
});

runAllRegisteredTests();

