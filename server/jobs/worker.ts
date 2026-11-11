import { prisma } from '../../lib/db.ts';
import { createContextLogger } from '../../lib/logger.ts';
import {
  getLLMProvider,
  getMusicProvider,
  getTTSProvider,
  getVideoProvider,
} from '../providers/index.ts';
import { generateValidatedStoryboard } from '../pipeline/storyboard.ts';
import { getStorage } from '../storage/adapter.ts';
import { assembleProjectVideo, type SceneAssemblyItem } from '../ffmpeg/assembler.ts';
import {
  enqueueJob,
  type AssembleJobPayload,
  type SceneJobPayload,
  type StoryboardJobPayload,
} from './queue.ts';
import type { DialogueLine } from '../../lib/validators.ts';

const MAX_JOB_ATTEMPTS = 3;

async function handleStoryboardJob(jobId: string, payload: StoryboardJobPayload) {
  const { projectId } = payload;
  const log = createContextLogger({ projectId, jobId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { characters: true },
  });
  if (!project) return;

  const llm = getLLMProvider();
  const storyboard = await generateValidatedStoryboard(
    llm,
    {
      title: project.title,
      sourceType: project.sourceType as 'idea' | 'script',
      sourceText: project.sourceText || project.title,
      language: project.language as 'vi' | 'en' | 'mixed',
      style: project.style,
      targetDurationSec: project.targetDurationSec,
      aspectRatio: project.aspectRatio as '9:16' | '16:9' | '1:1',
      characters: project.characters,
    },
    projectId
  );

  await prisma.scene.deleteMany({ where: { projectId } });

  for (const s of storyboard.scenes) {
    await prisma.scene.create({
      data: {
        projectId,
        index: s.index,
        title: s.title,
        narration: s.narration,
        dialogue: JSON.stringify(s.dialogue || []),
        visualPrompt: s.visualPrompt,
        negativePrompt: s.negativePrompt,
        cameraMotion: s.cameraMotion,
        durationSec: s.durationSec,
        characterRefs: JSON.stringify(project.characters.map((c: { id: string }) => c.id)),
        status: 'pending',
      },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: storyboard.title || project.title,
      status: 'storyboard_ready',
      lastError: null,
    },
  });

  log.info({ sceneCount: storyboard.scenes.length }, 'Storyboard generation complete');
}

async function checkAndTriggerAssembleIfReady(projectId: string) {
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { index: 'asc' },
  });
  if (scenes.length === 0) return;

  const allReady = scenes.every(
    (s: { videoPath: string | null; audioPath: string | null; status: string }) =>
      Boolean(s.videoPath) && Boolean(s.audioPath) && s.status === 'done'
  );

  if (allReady) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'assembling' },
    });
    await enqueueJob('assemble', { projectId, burnSubtitles: true });
  }
}

async function handleSceneVideoJob(jobId: string, payload: SceneJobPayload): Promise<'done' | 'rescheduled'> {
  const { projectId, sceneId } = payload;
  const log = createContextLogger({ projectId, sceneId, jobId });
  const storage = getStorage();

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: { project: true },
  });
  if (!scene || !scene.project) return 'done';

  // Idempotency check: if videoPath already exists, mark ready and check assembly
  if (scene.videoPath && (await storage.exists(scene.videoPath))) {
    if (scene.audioPath) {
      await prisma.scene.update({ where: { id: sceneId }, data: { status: 'done' } });
      await checkAndTriggerAssembleIfReady(projectId);
    }
    return 'done';
  }

  const videoProvider = getVideoProvider();
  let externalJobId = scene.providerJobId;

  // Step 1: Submit to VideoProvider ONLY if providerJobId is not yet stored (idempotent!)
  if (!externalJobId) {
    await prisma.scene.update({
      where: { id: sceneId },
      data: { status: 'submitted', attempts: { increment: 1 } },
    });

    externalJobId = await videoProvider.submitVideoJob({
      sceneId: scene.id,
      projectId,
      visualPrompt: scene.visualPrompt,
      negativePrompt: scene.negativePrompt,
      cameraMotion: scene.cameraMotion,
      durationSec: scene.durationSec,
      aspectRatio: (scene.project.aspectRatio as '9:16' | '16:9' | '1:1') || '9:16',
    });

    // Store providerJobId immediately before polling so worker restarts never resubmit
    await prisma.scene.update({
      where: { id: sceneId },
      data: { providerJobId: externalJobId, status: 'running' },
    });
  }

  // Step 2: Poll provider status
  const statusRes = await videoProvider.getVideoJobStatus(externalJobId);

  if (statusRes.status === 'queued' || statusRes.status === 'running') {
    const backoffNext = new Date(Date.now() + 2000);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'pending', lockedAt: null, runAt: backoffNext },
    });
    return 'rescheduled';
  }

  if (statusRes.status === 'failed') {
    throw new Error(statusRes.error || 'Video provider reported job failure');
  }

  // Step 3: Download or save video buffer to StorageAdapter
  let videoBuffer: Buffer;
  if (statusRes.videoBuffer) {
    videoBuffer = statusRes.videoBuffer;
  } else if (statusRes.videoUrl) {
    const resp = await fetch(statusRes.videoUrl);
    if (!resp.ok) throw new Error(`Failed to download scene video HTTP ${resp.status}`);
    videoBuffer = Buffer.from(await resp.arrayBuffer());
  } else {
    throw new Error('Video provider returned done without videoBuffer or videoUrl');
  }

  const relPath = await storage.saveFile(
    `projects/${projectId}/scene_${scene.index}_${scene.id}.mp4`,
    videoBuffer
  );

  await prisma.asset.create({
    data: {
      projectId,
      kind: 'video',
      path: relPath,
      durationSec: scene.durationSec,
    },
  });

  const refreshed = await prisma.scene.findUnique({ where: { id: sceneId } });
  const bothDone = Boolean(refreshed?.audioPath);

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      videoPath: relPath,
      status: bothDone ? 'done' : 'running',
      lastError: null,
    },
  });

  log.info({ relPath }, 'Scene video generated and saved');
  if (bothDone) {
    await checkAndTriggerAssembleIfReady(projectId);
  }
  return 'done';
}

async function handleSceneTTSJob(jobId: string, payload: SceneJobPayload) {
  const { projectId, sceneId } = payload;
  const log = createContextLogger({ projectId, sceneId, jobId });
  const storage = getStorage();

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: { project: true },
  });
  if (!scene || !scene.project) return;

  // Idempotent check
  if (scene.audioPath && (await storage.exists(scene.audioPath))) {
    if (scene.videoPath) {
      await prisma.scene.update({ where: { id: sceneId }, data: { status: 'done' } });
      await checkAndTriggerAssembleIfReady(projectId);
    }
    return;
  }

  let dialogueLines: DialogueLine[] = [];
  try {
    dialogueLines = JSON.parse(scene.dialogue || '[]');
  } catch {}

  const spokenText =
    dialogueLines.length > 0
      ? dialogueLines.map((d) => d.text).join('. ')
      : scene.narration || scene.title;

  const ttsLang: 'vi' | 'en' =
    dialogueLines[0]?.language || (scene.project.language === 'en' ? 'en' : 'vi');

  const ttsProvider = getTTSProvider();
  const ttsResult = await ttsProvider.synthesize({
    text: spokenText,
    language: ttsLang,
    targetDurationSec: scene.durationSec,
  });

  const relPath = await storage.saveFile(
    `projects/${projectId}/scene_${scene.index}_${scene.id}.${ttsResult.format}`,
    ttsResult.audioBuffer
  );

  await prisma.asset.create({
    data: {
      projectId,
      kind: 'audio',
      path: relPath,
      durationSec: ttsResult.durationSec,
    },
  });

  const refreshed = await prisma.scene.findUnique({ where: { id: sceneId } });
  const bothDone = Boolean(refreshed?.videoPath);

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      audioPath: relPath,
      status: bothDone ? 'done' : 'running',
      lastError: null,
    },
  });

  log.info({ relPath, language: ttsLang }, 'Scene TTS synthesized and saved');
  if (bothDone) {
    await checkAndTriggerAssembleIfReady(projectId);
  }
}

async function handleAssembleJob(jobId: string, payload: AssembleJobPayload) {
  const { projectId, burnSubtitles = true } = payload;
  const log = createContextLogger({ projectId, jobId });
  const storage = getStorage();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { index: 'asc' } } },
  });
  if (!project || project.scenes.length === 0) return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'assembling' },
  });

  const totalSec = project.scenes.reduce(
    (acc: number, s: { durationSec: number }) => acc + s.durationSec,
    0
  );

  // Generate optional background music track
  const musicProvider = getMusicProvider();
  const musicRes = await musicProvider.generateTrack({
    style: project.style,
    durationSec: totalSec,
  });
  const bgMusicRel = await storage.saveFile(
    `projects/${projectId}/bgm.${musicRes.format}`,
    musicRes.audioBuffer
  );
  await prisma.asset.create({
    data: {
      projectId,
      kind: 'music',
      path: bgMusicRel,
      durationSec: totalSec,
    },
  });

  const sceneItems: SceneAssemblyItem[] = project.scenes.map(
    (s: {
      id: string;
      index: number;
      durationSec: number;
      videoPath: string | null;
      audioPath: string | null;
      narration: string;
      dialogue: string;
    }) => {
      let parsedDialogue: DialogueLine[] = [];
      try {
        parsedDialogue = JSON.parse(s.dialogue || '[]');
      } catch {}
      return {
        sceneId: s.id,
        index: s.index,
        durationSec: s.durationSec,
        videoAbsPath: storage.getAbsolutePath(s.videoPath || ''),
        audioAbsPath: s.audioPath ? storage.getAbsolutePath(s.audioPath) : null,
        narration: s.narration,
        dialogue: parsedDialogue,
      };
    }
  );

  const assembled = await assembleProjectVideo({
    projectId,
    aspectRatio: project.aspectRatio,
    scenes: sceneItems,
    bgMusicAbsPath: storage.getAbsolutePath(bgMusicRel),
    burnSubtitles,
  });

  await prisma.asset.create({
    data: {
      projectId,
      kind: 'subtitle',
      path: assembled.subtitleSrtRelPath,
      durationSec: assembled.totalDurationSec,
    },
  });

  await prisma.asset.create({
    data: {
      projectId,
      kind: 'video',
      path: assembled.finalVideoRelPath,
      durationSec: assembled.totalDurationSec,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'done',
      finalVideoPath: assembled.finalVideoRelPath,
      subtitlePath: assembled.subtitleSrtRelPath,
      lastError: null,
    },
  });

  log.info(
    { finalVideoPath: assembled.finalVideoRelPath, totalDurationSec: assembled.totalDurationSec },
    'Project final MP4 assembled'
  );
}

/**
 * Processes up to `concurrency` due jobs in parallel and drains the queue until no ready jobs remain.
 */
export async function processAvailableJobs(concurrency = Number(process.env.WORKER_CONCURRENCY || '3')): Promise<number> {
  let processedTotal = 0;

  while (true) {
    const now = new Date();
    const candidates = await prisma.job.findMany({
      where: {
        status: 'pending',
        runAt: { lte: now },
      },
      orderBy: { runAt: 'asc' },
      take: concurrency,
    });

    if (candidates.length === 0) break;

    await Promise.all(
      candidates.map(async (job: { id: string; type: string; payload: string; attempts: number; projectId: string | null }) => {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'running',
            lockedAt: new Date(),
            attempts: { increment: 1 },
          },
        });

        const payload = JSON.parse(job.payload);
        try {
          if (job.type === 'storyboard') {
            await handleStoryboardJob(job.id, payload);
            await prisma.job.update({ where: { id: job.id }, data: { status: 'done', lastError: null } });
          } else if (job.type === 'scene_video') {
            const outcome = await handleSceneVideoJob(job.id, payload);
            if (outcome === 'done') {
              await prisma.job.update({ where: { id: job.id }, data: { status: 'done', lastError: null } });
            }
          } else if (job.type === 'scene_tts') {
            await handleSceneTTSJob(job.id, payload);
            await prisma.job.update({ where: { id: job.id }, data: { status: 'done', lastError: null } });
          } else if (job.type === 'assemble') {
            await handleAssembleJob(job.id, payload);
            await prisma.job.update({ where: { id: job.id }, data: { status: 'done', lastError: null } });
          }
          processedTotal++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const nextAttempts = (job.attempts || 0) + 1;
          const log = createContextLogger({
            projectId: job.projectId || undefined,
            jobId: job.id,
          });
          log.error({ errMsg, attempts: nextAttempts }, 'Job execution failed');

          if (nextAttempts < MAX_JOB_ATTEMPTS) {
            const delayMs = Math.pow(2, nextAttempts) * 500;
            await prisma.job.update({
              where: { id: job.id },
              data: {
                status: 'pending',
                lockedAt: null,
                lastError: errMsg,
                runAt: new Date(Date.now() + delayMs),
              },
            });
          } else {
            await prisma.job.update({
              where: { id: job.id },
              data: { status: 'failed', lastError: errMsg },
            });

            if (payload.sceneId) {
              await prisma.scene.update({
                where: { id: payload.sceneId },
                data: { status: 'failed', lastError: errMsg },
              });
            }
            if (job.projectId) {
              await prisma.project.update({
                where: { id: job.projectId },
                data: { status: 'failed', lastError: errMsg },
              });
            }
          }
        }
      })
    );
  }

  return processedTotal;
}

export async function startWorkerLoop() {
  const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || '1000');
  const log = createContextLogger({});
  log.info({ intervalMs }, 'Starting AI Video Studio background worker loop');

  while (true) {
    try {
      await processAvailableJobs();
    } catch (err) {
      log.error(err, 'Worker loop tick error');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.argv[1]?.endsWith('worker.ts')) {
  if (process.argv.includes('--once')) {
    processAvailableJobs().then((cnt) => {
      console.log(`Processed ${cnt} job(s).`);
      process.exit(0);
    });
  } else {
    startWorkerLoop();
  }
}
