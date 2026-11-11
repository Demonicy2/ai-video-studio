import { z } from 'zod';

export const CameraMotionEnum = z.enum([
  'static',
  'pan_left',
  'pan_right',
  'zoom_in',
  'zoom_out',
  'tilt_up',
  'tilt_down',
  'tracking',
]);

export const LanguageEnum = z.enum(['vi', 'en', 'mixed']);
export const AspectRatioEnum = z.enum(['9:16', '16:9', '1:1']);
export const SourceTypeEnum = z.enum(['idea', 'script']);

export const DialogueLineSchema = z.object({
  speaker: z.string().min(1, 'Speaker name is required'),
  text: z.string().min(1, 'Dialogue text is required'),
  language: z.enum(['vi', 'en']),
});

export const StoryboardSceneSchema = z.object({
  index: z.number().int().min(0),
  title: z.string().min(1, 'Scene title is required'),
  narration: z.string().default(''),
  dialogue: z.array(DialogueLineSchema).default([]),
  visualPrompt: z
    .string()
    .min(25, 'visualPrompt must be a detailed self-contained English description'),
  negativePrompt: z
    .string()
    .default('blurry, low quality, distorted faces, watermark, text overlay, deformed hands'),
  cameraMotion: CameraMotionEnum.default('static'),
  durationSec: z.number().int().min(2).max(30),
});

export const StoryboardOutputSchema = z.object({
  title: z.string().min(1, 'Storyboard title is required'),
  scenes: z.array(StoryboardSceneSchema).min(1, 'At least one scene is required'),
});

export type DialogueLine = {
  speaker: string;
  text: string;
  language: 'vi' | 'en';
};

export type StoryboardScene = {
  index: number;
  title: string;
  narration: string;
  dialogue: DialogueLine[];
  visualPrompt: string;
  negativePrompt: string;
  cameraMotion:
    | 'static'
    | 'pan_left'
    | 'pan_right'
    | 'zoom_in'
    | 'zoom_out'
    | 'tilt_up'
    | 'tilt_down'
    | 'tracking';
  durationSec: number;
};

export type StoryboardOutput = {
  title: string;
  scenes: StoryboardScene[];
};

export const AuthInputSchema = z.object({
  email: z.string().email('Email không hợp lệ / Invalid email'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự / Password min 6 chars'),
  name: z.string().min(1).optional(),
});

export const CharacterInputSchema = z.object({
  name: z.string().min(1, 'Character name required'),
  description: z.string().min(3, 'Character description required'),
  referenceImagePath: z.string().nullable().optional(),
});

export const CreateProjectInputSchema = z.object({
  title: z.string().min(1, 'Project title is required').max(140),
  sourceType: SourceTypeEnum.default('idea'),
  sourceText: z.string().min(5, 'Please enter an idea or script (at least 5 characters)'),
  language: LanguageEnum.default('vi'),
  aspectRatio: AspectRatioEnum.default('9:16'),
  targetDurationSec: z.coerce.number().int().min(5).max(180).default(15),
  style: z.string().min(2).default('realistic cinematic'),
  characters: z.array(CharacterInputSchema).default([]),
});

export const UpdateSceneInputSchema = z.object({
  title: z.string().min(1).optional(),
  narration: z.string().optional(),
  dialogue: z.array(DialogueLineSchema).optional(),
  visualPrompt: z.string().min(10).optional(),
  negativePrompt: z.string().optional(),
  cameraMotion: CameraMotionEnum.optional(),
  durationSec: z.coerce.number().int().min(2).max(30).optional(),
  index: z.coerce.number().int().min(0).optional(),
});

/**
 * Check if the total scene duration is within ±10% of targetDurationSec.
 */
export function isDurationWithinTolerance(
  scenes: Array<{ durationSec: number }>,
  targetDurationSec: number,
  toleranceRatio = 0.1
): boolean {
  if (!scenes.length || targetDurationSec <= 0) return false;
  const sum = scenes.reduce((acc, s) => acc + s.durationSec, 0);
  const minAllowed = Math.floor(targetDurationSec * (1 - toleranceRatio));
  const maxAllowed = Math.ceil(targetDurationSec * (1 + toleranceRatio));
  return sum >= minAllowed && sum <= maxAllowed;
}

/**
 * Reconciles scene durations proportionally so their sum matches targetDurationSec (within ±10%).
 */
export function reconcileSceneDurations<T extends { durationSec: number }>(
  scenes: T[],
  targetDurationSec: number
): T[] {
  if (scenes.length === 0) return [];
  if (isDurationWithinTolerance(scenes, targetDurationSec)) {
    return scenes.map((s) => ({ ...s }));
  }

  const currentTotal = scenes.reduce((acc, s) => acc + Math.max(1, s.durationSec), 0);
  const scale = targetDurationSec / currentTotal;

  const adjusted = scenes.map((s) => ({
    ...s,
    durationSec: Math.max(2, Math.min(30, Math.round(s.durationSec * scale))),
  }));

  let diff = targetDurationSec - adjusted.reduce((acc, s) => acc + s.durationSec, 0);
  let idx = 0;
  let guard = 0;
  while (diff !== 0 && guard < 100) {
    const targetScene = adjusted[idx % adjusted.length];
    if (diff > 0 && targetScene.durationSec < 30) {
      targetScene.durationSec += 1;
      diff -= 1;
    } else if (diff < 0 && targetScene.durationSec > 2) {
      targetScene.durationSec -= 1;
      diff += 1;
    }
    idx++;
    guard++;
  }

  return adjusted;
}

/**
 * Ensures character descriptions are injected into visualPrompt for consistency across scenes.
 */
export function injectCharacterDescriptions(
  visualPrompt: string,
  characters: Array<{ name: string; description: string }>
): string {
  if (!characters || characters.length === 0) return visualPrompt;
  const missing: string[] = [];
  for (const char of characters) {
    if (!visualPrompt.toLowerCase().includes(char.description.toLowerCase().slice(0, 18))) {
      missing.push(`${char.name} (${char.description})`);
    }
  }
  if (missing.length === 0) return visualPrompt;
  return `${visualPrompt.replace(/\.\s*$/, '')}. Character consistency reference: ${missing.join('; ')}.`;
}

