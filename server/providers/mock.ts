import type {
  GenerateStoryboardInput,
  LLMProvider,
  MusicProvider,
  SubmitVideoJobInput,
  SynthesizeTTSInput,
  SynthesizeTTSResult,
  TTSProvider,
  VideoJobStatusResult,
  VideoProvider,
} from './types.ts';
import type { StoryboardOutput, StoryboardScene } from '../../lib/validators.ts';
import { injectCharacterDescriptions, reconcileSceneDurations } from '../../lib/validators.ts';
import { generateSampleMp4Buffer, generateWavBuffer } from '../ffmpeg/sample-media.ts';

export class MockLLMProvider implements LLMProvider {
  public readonly name = 'mock-llm';

  async generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput> {
    const targetSec = Math.max(5, input.targetDurationSec || 15);
    const sceneCount = targetSec <= 12 ? 2 : targetSec <= 25 ? 3 : Math.min(8, Math.round(targetSec / 6));
    const baseSceneDur = Math.max(3, Math.floor(targetSec / sceneCount));

    const charSummary =
      input.characters.length > 0
        ? input.characters.map((c) => `${c.name} (${c.description})`).join(', ')
        : 'young protagonist wearing a glowing jacket with expressive eyes';

    const primarySpeaker = input.characters[0]?.name || (input.language === 'en' ? 'Narrator' : 'Người kể chuyện');
    const isVi = input.language === 'vi' || input.language === 'mixed';
    const dialogueLang: 'vi' | 'en' = isVi ? 'vi' : 'en';

    const cameraMotions: StoryboardScene['cameraMotion'][] = [
      'zoom_in',
      'tracking',
      'pan_right',
      'tilt_up',
      'static',
      'zoom_out',
    ];

    const rawBeats = [
      {
        titleVi: 'Mở đầu bối cảnh & Nhân vật chính',
        titleEn: 'Opening Establishing Shot & Hero Intro',
        narrationVi: `Câu chuyện bắt đầu: ${input.sourceText.slice(0, 90)}.`,
        narrationEn: `The story begins: ${input.sourceText.slice(0, 90)}.`,
        dialogueVi: 'Hành trình kỳ diệu này chính thức bắt đầu từ hôm nay!',
        dialogueEn: 'This extraordinary journey officially begins today!',
        setting: 'golden hour cyberpunk rooftop overlooking a vibrant misty skyline',
        action: 'standing heroically looking toward the horizon as wind moves their clothes',
        lighting: 'warm rim lighting with volumetric golden sunbeams and soft atmospheric haze',
        angle: 'medium wide low-angle shot',
      },
      {
        titleVi: 'Cao trào & Chuyển biến bất ngờ',
        titleEn: 'Rising Action & Unexpected Discovery',
        narrationVi: 'Một thử thách bất ngờ xuất hiện làm thay đổi toàn bộ cục diện.',
        narrationEn: 'An unexpected discovery transforms the entire situation.',
        dialogueVi: 'Nhìn kìa! Ánh sáng phía trước đang dẫn lối cho chúng ta!',
        dialogueEn: 'Look ahead! That glowing portal is guiding our way forward!',
        setting: 'mystical neon-lit alleyway with floating holographic lanterns and rain reflections',
        action: 'reaching out toward a floating crystalline artifact pulsing with energy',
        lighting: 'dramatic chiaroscuro lighting with cyan and amber reflections',
        angle: 'dynamic close-up tracking shot',
      },
      {
        titleVi: 'Kết thúc ấn tượng & Thông điệp',
        titleEn: 'Climactic Finale & Resolution',
        narrationVi: 'Khoảnh khắc quyết định khép lại với thông điệp đầy cảm hứng.',
        narrationEn: 'The decisive moment concludes with an inspiring revelation.',
        dialogueVi: 'Chỉ cần giữ vững niềm tin, mọi giới hạn đều có thể vượt qua.',
        dialogueEn: 'As long as we believe, every boundary can be transcended.',
        setting: 'panoramic mountain peak above glowing clouds under a starry aurora sky',
        action: 'smiling confidently as energy particles swirl upward into the night sky',
        lighting: 'cinematic bioluminescent glow with crisp Rim light and deep contrast',
        angle: 'sweeping crane wide shot',
      },
    ];

    const scenes: StoryboardScene[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const beat = rawBeats[i % rawBeats.length];
      const motion = cameraMotions[i % cameraMotions.length];
      const baseVisual = `Subject: ${charSummary}. Action: ${beat.action}. Setting: ${beat.setting} inspired by "${input.sourceText.slice(0, 60)}". Lighting: ${beat.lighting}. Camera angle: ${beat.angle}. Camera motion: ${motion}. Style: ${input.style}, ultra-detailed ${input.aspectRatio} vertical framing. Mood: immersive, emotional, high-production value.`;

      scenes.push({
        index: i,
        title: isVi ? `${beat.titleVi} (#${i + 1})` : `${beat.titleEn} (#${i + 1})`,
        narration: isVi ? beat.narrationVi : beat.narrationEn,
        dialogue: [
          {
            speaker: primarySpeaker,
            text: isVi ? beat.dialogueVi : beat.dialogueEn,
            language: dialogueLang,
          },
        ],
        visualPrompt: injectCharacterDescriptions(baseVisual, input.characters),
        negativePrompt:
          'blurry, low quality, distorted faces, watermark, text overlay, deformed hands, extra limbs',
        cameraMotion: motion,
        durationSec: baseSceneDur,
      });
    }

    const reconciled = reconcileSceneDurations(scenes, targetSec);
    return {
      title: input.title || (isVi ? 'Dự án Video AI Sáng Tạo' : 'Creative AI Video Story'),
      scenes: reconciled,
    };
  }
}

interface MockJobRecord {
  scene: SubmitVideoJobInput;
  polls: number;
}

const mockVideoJobs = new Map<string, MockJobRecord>();

export class MockVideoProvider implements VideoProvider {
  public readonly name = 'mock-video';

  async submitVideoJob(scene: SubmitVideoJobInput): Promise<string> {
    const externalJobId = `mock_vid_${scene.sceneId}_${Date.now()}`;
    mockVideoJobs.set(externalJobId, { scene, polls: 0 });
    return externalJobId;
  }

  async getVideoJobStatus(externalJobId: string): Promise<VideoJobStatusResult> {
    const record = mockVideoJobs.get(externalJobId);
    if (!record) {
      // Idempotent recovery if worker restarted after storing providerJobId
      const mp4 = generateSampleMp4Buffer({
        durationSec: 5,
        width: 1080,
        height: 1920,
        label: externalJobId,
      });
      return { status: 'done', videoBuffer: mp4 };
    }

    record.polls += 1;
    const is16x9 = record.scene.aspectRatio === '16:9';
    const is1x1 = record.scene.aspectRatio === '1:1';
    const width = is16x9 ? 1920 : 1080;
    const height = is16x9 ? 1080 : is1x1 ? 1080 : 1920;

    const mp4 = generateSampleMp4Buffer({
      durationSec: record.scene.durationSec,
      width,
      height,
      label: `Scene ${record.scene.sceneId} (${record.scene.cameraMotion})`,
    });

    return {
      status: 'done',
      videoBuffer: mp4,
    };
  }
}

export class MockTTSProvider implements TTSProvider {
  public readonly name = 'mock-tts';

  async synthesize(input: SynthesizeTTSInput): Promise<SynthesizeTTSResult> {
    const wordCount = Math.max(1, input.text.trim().split(/\s+/).length);
    const estimatedSec = input.targetDurationSec || Math.max(2, Math.min(20, Math.ceil(wordCount / 2.8)));
    const freq = input.language === 'vi' ? 440 : 528;
    const wav = generateWavBuffer({
      durationSec: estimatedSec,
      frequencyHz: freq,
      amplitude: 0.08,
      mode: 'voice',
    });
    return {
      audioBuffer: wav,
      format: 'wav',
      durationSec: estimatedSec,
    };
  }
}

export class MockMusicProvider implements MusicProvider {
  public readonly name = 'mock-music';

  async generateTrack(input: { style: string; durationSec: number }) {
    const wav = generateWavBuffer({
      durationSec: input.durationSec,
      frequencyHz: 220,
      amplitude: 0.04,
      mode: 'music',
    });
    return {
      audioBuffer: wav,
      format: 'wav' as const,
      durationSec: input.durationSec,
    };
  }
}

