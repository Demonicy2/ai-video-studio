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

const STYLE_CINEMATOGRAPHY: Record<
  string,
  { lighting: string; lens: string; palette: string; atmosphere: string }
> = {
  'anime fairy tale': {
    lighting: 'Makoto Shinkai & Studio Ghibli volumetric god rays, glowing bioluminescent particles, soft rim light',
    lens: '35mm anime cinema lens, shallow depth of field, hand-painted background bokeh',
    palette: 'vibrant twilight indigo, warm lantern gold, sakura coral, and luminous emerald',
    atmosphere: 'magical floating embers, gentle breeze, cel-shaded masterpiece quality',
  },
  'realistic cinematic': {
    lighting: 'Roger Deakins dramatic natural chiaroscuro lighting, volumetric fog, golden hour backlight',
    lens: 'ARRI Alexa 65 with Panavision 50mm anamorphic lens, f/1.4, subtle film grain',
    palette: 'rich teal and amber cinema grade, deep dynamic shadows, natural skin tones',
    atmosphere: 'photorealistic 8k IMAX cinema, atmospheric haze, tactile surface textures',
  },
  '3D cartoon': {
    lighting: 'Pixar & DreamWorks global illumination, subsurface scattering on skin, rim key light',
    lens: '50mm virtual cinema camera, tilt-shift miniature depth, crisp raytraced reflections',
    palette: 'saturated candy colors, warm sunlight, playful high-key contrast',
    atmosphere: 'expressive 3D character animation,Octane render, smooth tactile materials',
  },
  'cyberpunk neon': {
    lighting: 'drenched in magenta, electric cyan, and ultraviolet neon signs with wet asphalt reflections',
    lens: '24mm wide-angle anamorphic lens with horizontal blue lens flares and rain droplets',
    palette: 'deep obsidian black, neon violet, laser cyan, and holographic gold',
    atmosphere: 'futuristic megacity rain, rising steam vents, floating holographic UI projections',
  },
  'watercolor storybook': {
    lighting: 'soft diffused morning sunlight bleeding through textured cold-press watercolor paper',
    lens: 'medium storybook framing with delicate ink linework and painterly edges',
    palette: 'pastel sage green, warm ochre, dusty rose, and ultramarine wash',
    atmosphere: 'whimsical hand-illustrated fairy tale book, organic pigment blooms',
  },
};

function splitScriptIntoBeats(sourceText: string, desiredCount: number): string[] {
  const cleaned = sourceText.trim();
  // Check if user wrote explicit Scene/Cảnh markers
  const explicitScenes = cleaned
    .split(/(?=(?:Cảnh|Canh|Scene|Phần|Bước)\s*\d+\s*[:.-])/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (explicitScenes.length >= 2) {
    return explicitScenes;
  }

  // Otherwise split by sentences or newlines
  const sentences = cleaned
    .split(/(?:\r?\n)+|(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  if (sentences.length >= desiredCount) {
    const grouped: string[] = [];
    const chunkSize = Math.ceil(sentences.length / desiredCount);
    for (let i = 0; i < sentences.length; i += chunkSize) {
      grouped.push(sentences.slice(i, i + chunkSize).join(' '));
    }
    return grouped;
  }

  return sentences.length > 0 ? sentences : [cleaned];
}

function buildDynamicNarrativeBeat(opts: {
  beatIdx: number;
  totalBeats: number;
  rawBeatText: string;
  coreIdea: string;
  title: string;
  primaryCharName: string;
  charSummary: string;
  style: string;
  isVi: boolean;
}) {
  const { beatIdx, totalBeats, rawBeatText, coreIdea, primaryCharName, style, isVi } = opts;
  const cleanedBeat = rawBeatText.replace(/^(?:Cảnh|Canh|Scene|Phần|Bước)\s*\d+\s*[:.-]\s*/i, '').trim();
  const shortTopic = (cleanedBeat || coreIdea).slice(0, 120);

  const arcStages = [
    {
      role: 'establishing',
      titleVi: `Khởi đầu: ${shortTopic.slice(0, 42)}${shortTopic.length > 42 ? '...' : ''}`,
      titleEn: `Opening Hook: ${shortTopic.slice(0, 42)}${shortTopic.length > 42 ? '...' : ''}`,
      narrationVi: cleanedBeat || `Tại bối cảnh chính của câu chuyện, ${primaryCharName} bắt đầu hành trình: ${coreIdea}.`,
      narrationEn: cleanedBeat || `As the world unfolds, ${primaryCharName} embarks on the journey: ${coreIdea}.`,
      dialogueVi: cleanedBeat.length > 15 ? cleanedBeat : `Hãy nhìn xem! Đây chính là nơi câu chuyện "${opts.title}" bắt đầu!`,
      dialogueEn: cleanedBeat.length > 15 ? cleanedBeat : `Look around! This is where "${opts.title}" truly begins!`,
      action: `stepping into the frame with expressive determination while observing the surroundings related to "${shortTopic}"`,
      angle: 'sweeping wide establishing shot transitioning to medium hero framing',
      motion: 'zoom_in' as const,
    },
    {
      role: 'rising_action',
      titleVi: `Diễn biến & Khám phá: ${primaryCharName} hành động`,
      titleEn: `Rising Action: ${primaryCharName} in Motion`,
      narrationVi:
        beatIdx < opts.rawBeatText.length && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `${primaryCharName} tiến sâu hơn vào bối cảnh "${coreIdea.slice(0, 70)}", khám phá ra chi tiết quan trọng dẫn dắt mạch truyện.`,
      narrationEn:
        beatIdx < opts.rawBeatText.length && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `${primaryCharName} ventures deeper into "${coreIdea.slice(0, 70)}", uncovering the pivotal clue driving the story forward.`,
      dialogueVi:
        beatIdx > 0 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Mọi thứ đang dần hé lộ! Chúng ta không thể dừng lại ở đây được!`,
      dialogueEn:
        beatIdx > 0 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Everything is coming together now—we have to keep moving forward!`,
      action: `actively interacting with the key elements of "${shortTopic}", dynamic body language and expressive facial emotion`,
      angle: 'dynamic low-angle tracking medium shot',
      motion: 'tracking' as const,
    },
    {
      role: 'climax',
      titleVi: `Cao trào cảm xúc & Bước ngoặt quyết định`,
      titleEn: `Climactic Turning Point & Revelation`,
      narrationVi:
        beatIdx >= 2 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Khoảnh khắc ấn tượng nhất bùng nổ khi ${primaryCharName} đối diện trực tiếp với thử thách trung tâm của "${opts.title}".`,
      narrationEn:
        beatIdx >= 2 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `The tension peaks as ${primaryCharName} confronts the central challenge of "${opts.title}".`,
      dialogueVi:
        beatIdx >= 2 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Chính là khoảnh khắc này! Hãy cùng tạo nên điều kỳ diệu!`,
      dialogueEn:
        beatIdx >= 2 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `This is the moment we've been waiting for—let's make it happen!`,
      action: `in a dramatic high-energy pose at the climax of "${shortTopic}", surrounded by dynamic motion and atmospheric particles`,
      angle: 'cinematic close-up to wide orbit shot',
      motion: 'pan_right' as const,
    },
    {
      role: 'resolution',
      titleVi: `Kết thúc trọn vẹn & Dư âm ấn tượng`,
      titleEn: `Inspiring Finale & Lasting Impression`,
      narrationVi:
        beatIdx === totalBeats - 1 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Hành trình "${opts.title}" khép lại với khung hình rực rỡ và thông điệp đáng nhớ cùng ${primaryCharName}.`,
      narrationEn:
        beatIdx === totalBeats - 1 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `The story of "${opts.title}" concludes with a breathtaking final frame alongside ${primaryCharName}.`,
      dialogueVi:
        beatIdx === totalBeats - 1 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Cảm ơn bạn đã đồng hành trong hành trình tuyệt vời này!`,
      dialogueEn:
        beatIdx === totalBeats - 1 && cleanedBeat !== coreIdea
          ? cleanedBeat
          : `Thank you for joining this unforgettable adventure!`,
      action: `looking confidently toward the camera as the environment of "${shortTopic}" glows in the background`,
      angle: 'majestic crane pull-back wide shot',
      motion: 'zoom_out' as const,
    },
  ];

  const stageIdx =
    beatIdx === 0
      ? 0
      : beatIdx === totalBeats - 1 && totalBeats > 2
      ? 3
      : (beatIdx % 2) + 1;

  const template = arcStages[stageIdx];
  const stylePreset =
    STYLE_CINEMATOGRAPHY[style] || STYLE_CINEMATOGRAPHY['realistic cinematic'];

  return {
    title: isVi ? template.titleVi : template.titleEn,
    narration: isVi ? template.narrationVi : template.narrationEn,
    dialogueText: isVi ? template.dialogueVi : template.dialogueEn,
    cameraMotion: template.motion,
    visualPrompt: `Subject: ${opts.charSummary}. Action: ${template.action}. Setting: detailed environment depicting "${shortTopic}". Lighting: ${stylePreset.lighting}. Lens & Camera Angle: ${template.angle}, ${stylePreset.lens}. Camera motion: ${template.motion}. Color Palette: ${stylePreset.palette}. Style: ${style}, ${stylePreset.atmosphere}. Mood: cinematic, emotionally resonant, ultra-detailed.`,
  };
}

export class MockLLMProvider implements LLMProvider {
  public readonly name = 'smart-local-director';

  async generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardOutput> {
    const targetSec = Math.max(5, input.targetDurationSec || 15);
    const desiredSceneCount =
      targetSec <= 12 ? 2 : targetSec <= 25 ? 3 : Math.min(8, Math.round(targetSec / 5));

    const parsedBeats = splitScriptIntoBeats(input.sourceText, desiredSceneCount);
    const sceneCount = Math.max(desiredSceneCount, Math.min(8, parsedBeats.length));
    const baseSceneDur = Math.max(3, Math.floor(targetSec / sceneCount));

    const charSummary =
      input.characters.length > 0
        ? input.characters.map((c) => `${c.name} (${c.description})`).join('; ')
        : 'expressive lead protagonist with cinematic wardrobe and distinct silhouette';

    const primarySpeaker =
      input.characters[0]?.name || (input.language === 'en' ? 'Narrator' : 'Người kể chuyện');
    const isVi = input.language === 'vi' || input.language === 'mixed';
    const dialogueLang: 'vi' | 'en' = isVi ? 'vi' : 'en';

    const scenes: StoryboardScene[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const rawBeatText = parsedBeats[i] || parsedBeats[parsedBeats.length - 1] || input.sourceText;
      const generated = buildDynamicNarrativeBeat({
        beatIdx: i,
        totalBeats: sceneCount,
        rawBeatText,
        coreIdea: input.sourceText,
        title: input.title,
        primaryCharName: primarySpeaker,
        charSummary,
        style: input.style,
        isVi,
      });

      scenes.push({
        index: i,
        title: generated.title,
        narration: generated.narration,
        dialogue: [
          {
            speaker: primarySpeaker,
            text: generated.dialogueText,
            language: dialogueLang,
          },
        ],
        visualPrompt: injectCharacterDescriptions(generated.visualPrompt, input.characters),
        negativePrompt:
          'blurry, low quality, distorted anatomy, watermark, text overlay, deformed hands, extra digits, washed out colors',
        cameraMotion: generated.cameraMotion,
        durationSec: baseSceneDur,
      });
    }

    const reconciled = reconcileSceneDurations(scenes, targetSec);
    return {
      title: input.title || (isVi ? 'Dự Án Video AI Điện Ảnh' : 'Cinematic AI Video Project'),
      scenes: reconciled,
    };
  }
}

/**
 * AI Prompt & Script Enhancer: turns a brief 1-line idea into a rich 3-to-4 scene script with dialogue.
 */
export function enhanceScriptLocally(opts: {
  title: string;
  idea: string;
  language: 'vi' | 'en' | 'mixed';
  style: string;
  characterName?: string;
}): { enhancedTitle: string; enhancedScript: string } {
  const isVi = opts.language !== 'en';
  const hero = opts.characterName || (isVi ? 'Nhân vật chính' : 'The Protagonist');
  const rawIdea = opts.idea.trim() || (isVi ? 'Hành trình khám phá thế giới tương lai' : 'A journey into a futuristic world');
  const cleanTitle =
    opts.title.trim() ||
    (isVi ? `Tuyệt Tác AI: ${rawIdea.slice(0, 35)}` : `AI Masterpiece: ${rawIdea.slice(0, 35)}`);

  if (isVi) {
    return {
      enhancedTitle: cleanTitle,
      enhancedScript: [
        `Cảnh 1: Mở đầu ấn tượng — Giữa khung cảnh mang phong cách ${opts.style}, ${hero} xuất hiện đầy cuốn hút khi câu chuyện "${rawIdea}" bắt đầu mở ra dưới ánh sáng điện ảnh rực rỡ.`,
        `Cảnh 2: Khám phá & Cao trào — ${hero} tiến sâu vào trung tâm bối cảnh, tương tác trực tiếp với những chi tiết kỳ ảo xung quanh và phát hiện ra chìa khóa quan trọng nhất của hành trình.`,
        `Cảnh 3: Kết thúc bùng nổ cảm xúc — Khoảnh khắc đẹp nhất khép lại khi ${hero} mỉm cười tự tin giữa khung cảnh hùng vĩ, để lại thông điệp sâu sắc và ấn tượng thị giác mạnh mẽ.`,
      ].join('\n\n'),
    };
  }

  return {
    enhancedTitle: cleanTitle,
    enhancedScript: [
      `Scene 1: Establishing Hook — Set in a breathtaking ${opts.style} world, ${hero} steps into the light as "${rawIdea}" begins to unfold with dramatic tension.`,
      `Scene 2: Rising Discovery — ${hero} moves dynamically through the environment, uncovering the central mystery as atmospheric particles swirl around the frame.`,
      `Scene 3: Iconic Finale — At the emotional climax, ${hero} stands triumphant against a sweeping panoramic backdrop, leaving an unforgettable visual impression.`,
    ].join('\n\n'),
  };
}

interface MockJobRecord {
  scene: SubmitVideoJobInput;
  polls: number;
}

const mockVideoJobs = new Map<string, MockJobRecord>();

export class MockVideoProvider implements VideoProvider {
  public readonly name = 'cinema-canvas-video';

  async submitVideoJob(scene: SubmitVideoJobInput): Promise<string> {
    const externalJobId = `mock_vid_${scene.sceneId}_${Date.now()}`;
    mockVideoJobs.set(externalJobId, { scene, polls: 0 });
    return externalJobId;
  }

  async getVideoJobStatus(externalJobId: string): Promise<VideoJobStatusResult> {
    const record = mockVideoJobs.get(externalJobId);
    if (!record) {
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
    const estimatedSec =
      input.targetDurationSec || Math.max(2, Math.min(20, Math.ceil(wordCount / 2.8)));
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
