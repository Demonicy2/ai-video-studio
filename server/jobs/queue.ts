import { prisma } from '../../lib/db.ts';
import { createContextLogger } from '../../lib/logger.ts';

export type JobType = 'storyboard' | 'scene_video' | 'scene_tts' | 'assemble';

export interface StoryboardJobPayload {
  projectId: string;
}

export interface SceneJobPayload {
  projectId: string;
  sceneId: string;
}

export interface AssembleJobPayload {
  projectId: string;
  burnSubtitles?: boolean;
}

export async function enqueueJob(
  type: JobType,
  payload: StoryboardJobPayload | SceneJobPayload | AssembleJobPayload,
  runAt: Date = new Date()
) {
  const projectId = payload.projectId;
  const log = createContextLogger({ projectId });

  // Deduplicate active pending/running jobs with identical type & payload
  const payloadStr = JSON.stringify(payload);
  const existing = await prisma.job.findMany({
    where: {
      projectId,
      type,
      status: { in: ['pending', 'running'] },
    },
  });

  const duplicate = existing.find((j: { payload: string }) => j.payload === payloadStr);
  if (duplicate) {
    log.debug({ jobId: duplicate.id, type }, 'Skipped duplicate active job enqueue');
    return duplicate;
  }

  const job = await prisma.job.create({
    data: {
      projectId,
      type,
      payload: payloadStr,
      status: 'pending',
      runAt,
    },
  });

  log.info({ jobId: job.id, type }, 'Enqueued job');
  return job;
}

export async function enqueueProjectGenerationJobs(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { index: 'asc' } } },
  });
  if (!project) throw new Error('Project not found');
  if (!project.scenes.length) throw new Error('Project has no scenes to generate');

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'generating', lastError: null },
  });

  for (const scene of project.scenes) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        status: 'pending',
        lastError: null,
      },
    });
    await enqueueJob('scene_video', { projectId, sceneId: scene.id });
    await enqueueJob('scene_tts', { projectId, sceneId: scene.id });
  }
}

export async function enqueueSingleSceneRegeneration(projectId: string, sceneId: string) {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.projectId !== projectId) {
    throw new Error('Scene not found in project');
  }

  // Reset only this scene's artifacts & providerJobId so it regenerates cleanly
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      status: 'pending',
      providerJobId: null,
      videoPath: null,
      audioPath: null,
      lastError: null,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'generating', lastError: null },
  });

  await enqueueJob('scene_video', { projectId, sceneId });
  await enqueueJob('scene_tts', { projectId, sceneId });
}

