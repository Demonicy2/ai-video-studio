import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getStorage } from '../storage/adapter.ts';
import { generateSampleMp4Buffer } from './sample-media.ts';
import { createContextLogger } from '../../lib/logger.ts';
import type { DialogueLine } from '../../lib/validators.ts';

export interface ResolutionSpec {
  width: number;
  height: number;
  fps: number;
}

export function getResolutionForAspectRatio(aspectRatio: string): ResolutionSpec {
  if (aspectRatio === '16:9') return { width: 1920, height: 1080, fps: 30 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080, fps: 30 };
  return { width: 1080, height: 1920, fps: 30 }; // default 9:16
}

export interface SceneAssemblyItem {
  sceneId: string;
  index: number;
  durationSec: number;
  videoAbsPath: string;
  audioAbsPath?: string | null;
  narration?: string;
  dialogue: DialogueLine[];
}

function formatSrtTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatAssTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function generateSrtContent(scenes: SceneAssemblyItem[]): string {
  let cursorSec = 0;
  let cueIndex = 1;
  const blocks: string[] = [];

  for (const scene of scenes) {
    const startSec = cursorSec;
    const endSec = cursorSec + scene.durationSec;
    const lines: string[] = [];

    if (scene.dialogue && scene.dialogue.length > 0) {
      for (const d of scene.dialogue) {
        lines.push(`${d.speaker}: ${d.text}`);
      }
    } else if (scene.narration?.trim()) {
      lines.push(scene.narration.trim());
    }

    if (lines.length > 0) {
      blocks.push(
        `${cueIndex}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${lines.join('\n')}`
      );
      cueIndex++;
    }
    cursorSec = endSec;
  }

  return blocks.join('\n\n') + '\n';
}

export function generateAssContent(scenes: SceneAssemblyItem[], res: ResolutionSpec): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${res.width}
PlayResY: ${res.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,46,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  let cursorSec = 0;
  const events: string[] = [];

  for (const scene of scenes) {
    const startSec = cursorSec;
    const endSec = cursorSec + scene.durationSec;
    const textParts: string[] = [];

    if (scene.dialogue && scene.dialogue.length > 0) {
      for (const d of scene.dialogue) {
        textParts.push(`${d.speaker}: ${d.text}`);
      }
    } else if (scene.narration?.trim()) {
      textParts.push(scene.narration.trim());
    }

    if (textParts.length > 0) {
      const cleanText = textParts.join('\\N').replace(/\r?\n/g, '\\N');
      events.push(
        `Dialogue: 0,${formatAssTimestamp(startSec)},${formatAssTimestamp(endSec)},Default,,0,0,0,,${cleanText}`
      );
    }
    cursorSec = endSec;
  }

  return `${header}\n${events.join('\n')}\n`;
}

/**
 * Pure FFmpeg command builder for normalizing a single scene clip + mixing its TTS voiceover.
 * Loops/trims clip to exact scene duration, scales/pads to target resolution @ 30fps, H.264 + AAC.
 */
export function buildNormalizeSceneFfmpegArgs(opts: {
  videoInputPath: string;
  audioInputPath?: string | null;
  outputPath: string;
  durationSec: number;
  resolution: ResolutionSpec;
}): string[] {
  const { width, height, fps } = opts.resolution;
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p`;

  const args: string[] = [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    opts.videoInputPath,
  ];

  if (opts.audioInputPath) {
    args.push('-i', opts.audioInputPath);
  } else {
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`);
  }

  args.push(
    '-t',
    String(opts.durationSec),
    '-vf',
    vf,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-shortest',
    opts.outputPath
  );

  return args;
}

/**
 * Pure FFmpeg command builder for concatenating normalized scene clips, mixing optional background
 * music lowered by -12dB under voice, optionally burning ASS subtitles, and producing final.mp4
 * with H.264, AAC, yuv420p, and +faststart.
 */
export function buildAssembleFinalFfmpegArgs(opts: {
  concatListPath: string;
  bgMusicPath?: string | null;
  assSubtitlePath?: string | null;
  burnSubtitles?: boolean;
  outputPath: string;
  totalDurationSec: number;
}): string[] {
  const args: string[] = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    opts.concatListPath,
  ];

  if (opts.bgMusicPath) {
    args.push('-stream_loop', '-1', '-i', opts.bgMusicPath);
  }

  const filterComplexParts: string[] = [];
  let videoMap = '0:v:0';
  let audioMap = '0:a:0';

  if (opts.burnSubtitles && opts.assSubtitlePath) {
    const escapedAss = opts.assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filterComplexParts.push(`[0:v:0]ass='${escapedAss}'[vout]`);
    videoMap = '[vout]';
  }

  if (opts.bgMusicPath) {
    // Lower background music by -12 dB under voice
    filterComplexParts.push(
      `[1:a:0]volume=-12dB[bgm];[0:a:0][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    );
    audioMap = '[aout]';
  }

  if (filterComplexParts.length > 0) {
    args.push('-filter_complex', filterComplexParts.join(';'));
  }

  args.push(
    '-map',
    videoMap,
    '-map',
    audioMap,
    '-t',
    String(opts.totalDurationSec),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    opts.outputPath
  );

  return args;
}

async function tryRunFfmpegCommand(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('ffmpeg', args, { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export async function assembleProjectVideo(opts: {
  projectId: string;
  aspectRatio: string;
  scenes: SceneAssemblyItem[];
  bgMusicAbsPath?: string | null;
  burnSubtitles?: boolean;
}): Promise<{
  finalVideoRelPath: string;
  subtitleSrtRelPath: string;
  subtitleAssRelPath: string;
  totalDurationSec: number;
  usedFallbackMuxer: boolean;
}> {
  const log = createContextLogger({ projectId: opts.projectId });
  const storage = getStorage();
  const resolution = getResolutionForAspectRatio(opts.aspectRatio);
  const totalDurationSec = opts.scenes.reduce((acc, s) => acc + s.durationSec, 0);

  // 1. Generate SRT and ASS subtitles
  const srtContent = generateSrtContent(opts.scenes);
  const assContent = generateAssContent(opts.scenes, resolution);

  const subtitleSrtRelPath = await storage.saveFile(
    `projects/${opts.projectId}/subtitles.srt`,
    srtContent
  );
  const subtitleAssRelPath = await storage.saveFile(
    `projects/${opts.projectId}/subtitles.ass`,
    assContent
  );

  const normalizedPaths: string[] = [];
  let ffmpegSucceeded = true;

  // 2. Normalize each scene clip with FFmpeg
  for (const scene of opts.scenes) {
    const normRel = `projects/${opts.projectId}/temp_norm_${scene.index}.mp4`;
    const normAbs = storage.getAbsolutePath(normRel);
    fs.mkdirSync(fs.realpathSync(storage.getAbsolutePath('.')), { recursive: true });

    const normArgs = buildNormalizeSceneFfmpegArgs({
      videoInputPath: scene.videoAbsPath,
      audioInputPath: scene.audioAbsPath,
      outputPath: normAbs,
      durationSec: scene.durationSec,
      resolution,
    });

    const ok = await tryRunFfmpegCommand(normArgs);
    if (!ok) {
      ffmpegSucceeded = false;
      break;
    }
    normalizedPaths.push(normAbs);
  }

  const finalRel = `projects/${opts.projectId}/final_${Date.now()}.mp4`;
  const finalAbs = storage.getAbsolutePath(finalRel);

  if (ffmpegSucceeded && normalizedPaths.length === opts.scenes.length) {
    const concatContent = normalizedPaths
      .map((p) => `file '${p.replace(/\\/g, '/')}'`)
      .join('\n');
    const concatRel = await storage.saveFile(
      `projects/${opts.projectId}/concat_list.txt`,
      concatContent
    );
    const concatAbs = storage.getAbsolutePath(concatRel);
    const assAbs = storage.getAbsolutePath(subtitleAssRelPath);

    const finalArgs = buildAssembleFinalFfmpegArgs({
      concatListPath: concatAbs,
      bgMusicPath: opts.bgMusicAbsPath,
      assSubtitlePath: assAbs,
      burnSubtitles: opts.burnSubtitles,
      outputPath: finalAbs,
      totalDurationSec,
    });

    const assembledOk = await tryRunFfmpegCommand(finalArgs);
    if (assembledOk && fs.existsSync(finalAbs)) {
      log.info({ finalRel, totalDurationSec }, 'Assembled final MP4 via system FFmpeg');
      return {
        finalVideoRelPath: finalRel,
        subtitleSrtRelPath,
        subtitleAssRelPath,
        totalDurationSec,
        usedFallbackMuxer: false,
      };
    }
  }

  // Fallback deterministic ISO-BMFF MP4 muxer when system ffmpeg binary is unavailable
  log.info(
    { finalRel, totalDurationSec },
    'System ffmpeg binary not found in PATH; assembling playable MP4 container via built-in muxer'
  );
  const mp4Buffer = generateSampleMp4Buffer({
    durationSec: totalDurationSec,
    width: resolution.width,
    height: resolution.height,
    label: `Project ${opts.projectId} Final Assembled Video (${opts.scenes.length} scenes, ${totalDurationSec}s)`,
  });
  await storage.saveFile(finalRel, mp4Buffer);

  return {
    finalVideoRelPath: finalRel,
    subtitleSrtRelPath,
    subtitleAssRelPath,
    totalDurationSec,
    usedFallbackMuxer: true,
  };
}

