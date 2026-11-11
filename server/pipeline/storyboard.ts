import type { GenerateStoryboardInput, LLMProvider } from '../providers/types.ts';
import {
  StoryboardOutputSchema,
  type StoryboardOutput,
  injectCharacterDescriptions,
  isDurationWithinTolerance,
  reconcileSceneDurations,
} from '../../lib/validators.ts';
import { createContextLogger } from '../../lib/logger.ts';

export function buildStoryboardSystemPrompt(input: GenerateStoryboardInput): string {
  const charBlock =
    input.characters.length > 0
      ? input.characters
          .map((c, idx) => `  ${idx + 1}. "${c.name}": ${c.description}`)
          .join('\n')
      : '  (No predefined characters — invent consistent main character description and repeat it in every scene visualPrompt)';

  return `You are an expert AI Film Director and Storyboard Architect for short-form social video (TikTok, YouTube Shorts, Reels).
Respond ONLY with a valid JSON object matching this exact schema:
{
  "title": "string",
  "scenes": [
    {
      "index": 0,
      "title": "string",
      "narration": "string",
      "dialogue": [{ "speaker": "string", "text": "string", "language": "vi" | "en" }],
      "visualPrompt": "string",
      "negativePrompt": "string",
      "cameraMotion": "static" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out" | "tilt_up" | "tilt_down" | "tracking",
      "durationSec": 5
    }
  ]
}

CRITICAL RULES:
1. visualPrompt MUST ALWAYS BE IN ENGLISH, self-contained, and explicitly include:
   - Subject & full character visual descriptions
   - Action / movement
   - Setting / environment
   - Lighting
   - Camera angle & camera motion
   - Style ("${input.style}") and Mood
2. Character consistency: Inject these exact character descriptions into every scene's visualPrompt where they appear:
${charBlock}
3. Language rules:
   - Project language mode is "${input.language}".
   - If language is "vi", keep narration and dialogue[].text in natural Vietnamese for TTS, while visualPrompt stays in English!
4. Duration rules:
   - Target total duration is ${input.targetDurationSec} seconds (aspect ratio: ${input.aspectRatio}).
   - The sum of all scenes[].durationSec MUST be within ±10% of ${input.targetDurationSec} seconds.${
    input.validationErrorFeedback
      ? `\n5. PREVIOUS OUTPUT FAILED VALIDATION — FIX THIS ERROR:\n${input.validationErrorFeedback}`
      : ''
  }`;
}

/**
 * Generates a storyboard via the configured LLMProvider, validates output with Zod,
 * retries once feeding any Zod or duration validation error back to the model,
 * and enforces character description injection + duration reconciliation.
 */
export async function generateValidatedStoryboard(
  provider: LLMProvider,
  input: GenerateStoryboardInput,
  projectId?: string
): Promise<StoryboardOutput> {
  const log = createContextLogger({ projectId, provider: provider.name });

  let lastFeedback: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawResult = await provider.generateStoryboard({
      ...input,
      validationErrorFeedback: lastFeedback,
    });

    const parsed = StoryboardOutputSchema.safeParse(rawResult);
    if (!parsed.success) {
      const errMsg = parsed.error.message;
      log.warn({ attempt, errMsg }, 'Storyboard output failed Zod validation');
      if (attempt === 1) {
        lastFeedback = `Zod schema validation error: ${errMsg}`;
        continue;
      }
      throw new Error(`Storyboard validation failed after retry: ${errMsg}`);
    }

    const storyboard = parsed.data;
    if (!isDurationWithinTolerance(storyboard.scenes, input.targetDurationSec, 0.1)) {
      log.info(
        { attempt, targetDurationSec: input.targetDurationSec },
        'Reconciling scene durations to within ±10% of targetDurationSec'
      );
      storyboard.scenes = reconcileSceneDurations(storyboard.scenes, input.targetDurationSec);
    }

    storyboard.scenes = storyboard.scenes.map((scene, idx) => ({
      ...scene,
      index: idx,
      visualPrompt: injectCharacterDescriptions(scene.visualPrompt, input.characters),
    }));

    return storyboard;
  }

  throw new Error('Unexpected storyboard generation termination');
}

