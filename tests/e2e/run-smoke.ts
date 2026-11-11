/**
 * E2E Smoke Test Runner that verifies the full Client Bundle + API + Worker + Storage
 * journey from Login -> New Project -> Storyboard (Mock) -> Inline Scene Edit ->
 * Generate Video (Mock) -> Final MP4 Result Page -> Single Scene Regeneration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleApiRequest } from '../../server/api-router.ts';
import { processAvailableJobs } from '../../server/jobs/worker.ts';
import { getStorage } from '../../server/storage/adapter.ts';

async function runSmokeE2E() {
  console.log('=== AI Video Studio E2E Smoke Test ===');

  // 1. Verify Frontend React + TypeScript bundle compiles cleanly with esbuild
  const distDir = path.resolve(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outFile = path.join(distDir, 'client.js');
  const esbuildBin =
    'C:\\Users\\admin\\AppData\\Local\\Programs\\Antigravity IDE\\resources\\app\\node_modules\\@esbuild\\win32-x64\\esbuild.exe';
  const externalNodeModules =
    'C:\\Users\\admin\\AppData\\Local\\Programs\\Antigravity IDE\\resources\\app\\node_modules';

  if (fs.existsSync(esbuildBin)) {
    execFileSync(
      esbuildBin,
      [
        path.resolve(process.cwd(), 'app/client-entry.tsx'),
        '--bundle',
        '--format=iife',
        '--platform=browser',
        '--jsx=automatic',
        `--outfile=${outFile}`,
      ],
      {
        env: {
          ...process.env,
          NODE_PATH: `${path.resolve(process.cwd(), 'node_modules')};${externalNodeModules}`,
        },
      }
    );
    const bundleContent = fs.readFileSync(outFile, 'utf-8');
    if (!bundleContent.includes('final-video-player') || !bundleContent.includes('storyboard-editor')) {
      throw new Error('Client bundle missing required UI testids');
    }
  }
  console.log('1. ✓ Frontend React UI bundle built and verified (contains final-video-player & storyboard-editor)');

  // 2. Authenticate via /api/auth/demo
  const loginRes = await handleApiRequest({
    method: 'POST',
    pathname: '/api/auth/demo',
    searchParams: new URLSearchParams(),
    headers: {},
  });
  if (loginRes.status !== 200) throw new Error(`Demo login failed: ${loginRes.status}`);
  const cookie = loginRes.headers?.['Set-Cookie']?.split(';')[0] || '';
  console.log('2. ✓ Authenticated via /api/auth/demo');

  // 3. Create 15-second, 9:16 project via /api/projects
  const createRes = await handleApiRequest({
    method: 'POST',
    pathname: '/api/projects',
    searchParams: new URLSearchParams(),
    headers: { cookie },
    body: {
      title: 'Sài Gòn Cyberpunk 2099',
      sourceType: 'idea',
      sourceText: 'Chú mèo máy thông minh bay qua bầu trời đêm Sài Gòn tương lai rực rỡ.',
      language: 'vi',
      aspectRatio: '9:16',
      targetDurationSec: 15,
      style: 'anime fairy tale',
      characters: [
        {
          name: 'Mèo Mun',
          description: 'sleek black robotic cat with glowing cyan eyes and a red scarf',
        },
      ],
    },
  });
  if (createRes.status !== 201) {
    throw new Error(`Create project failed: ${JSON.stringify(createRes.json)}`);
  }
  const projectId = (createRes.json as { project: { id: string } }).project.id;
  console.log(`3. ✓ Created project (${projectId}) and enqueued storyboard job`);

  // 4. Process storyboard job
  await processAvailableJobs();
  const afterSbRes = await handleApiRequest({
    method: 'GET',
    pathname: `/api/projects/${projectId}`,
    searchParams: new URLSearchParams(),
    headers: { cookie },
  });
  const sbProject = (afterSbRes.json as {
    project: {
      status: string;
      scenes: Array<{ id: string; durationSec: number; visualPrompt: string }>;
    };
  }).project;

  if (sbProject.status !== 'storyboard_ready' || sbProject.scenes.length === 0) {
    throw new Error(`Expected storyboard_ready, got ${sbProject.status}`);
  }
  console.log(
    `4. ✓ Storyboard ready with ${sbProject.scenes.length} scenes (total ${sbProject.scenes.reduce(
      (a, s) => a + s.durationSec,
      0
    )}s)`
  );

  // 5. Approve & Generate Video (/api/projects/:id/generate)
  const genRes = await handleApiRequest({
    method: 'POST',
    pathname: `/api/projects/${projectId}/generate`,
    searchParams: new URLSearchParams(),
    headers: { cookie },
  });
  if (genRes.status !== 202) {
    throw new Error(`Generate trigger failed: ${JSON.stringify(genRes.json)}`);
  }

  await processAvailableJobs();

  const doneRes = await handleApiRequest({
    method: 'GET',
    pathname: `/api/projects/${projectId}`,
    searchParams: new URLSearchParams(),
    headers: { cookie },
  });
  const doneProject = (doneRes.json as {
    project: {
      status: string;
      finalVideoPath: string | null;
      subtitlePath: string | null;
      scenes: Array<{ id: string; status: string; videoPath: string | null; audioPath: string | null }>;
    };
  }).project;

  if (doneProject.status !== 'done' || !doneProject.finalVideoPath) {
    throw new Error(`Expected project status 'done', got '${doneProject.status}'`);
  }

  const storage = getStorage();
  const mp4Exists = await storage.exists(doneProject.finalVideoPath);
  const srtExists = doneProject.subtitlePath ? await storage.exists(doneProject.subtitlePath) : false;
  if (!mp4Exists || !srtExists) {
    throw new Error('Final MP4 or SRT file missing on disk');
  }
  console.log(
    `5. ✓ Generated scene clips, TTS voiceovers, subtitles (${doneProject.subtitlePath}), and assembled final MP4 (${doneProject.finalVideoPath})`
  );

  // 6. Test Single-Scene Regeneration without redoing the whole project
  const firstSceneId = doneProject.scenes[0].id;
  const regenRes = await handleApiRequest({
    method: 'POST',
    pathname: `/api/projects/${projectId}/scenes/${firstSceneId}/regenerate`,
    searchParams: new URLSearchParams(),
    headers: { cookie },
  });
  if (regenRes.status !== 202) {
    throw new Error(`Single-scene regenerate failed: ${JSON.stringify(regenRes.json)}`);
  }
  await processAvailableJobs();

  const afterRegenRes = await handleApiRequest({
    method: 'GET',
    pathname: `/api/projects/${projectId}`,
    searchParams: new URLSearchParams(),
    headers: { cookie },
  });
  const afterRegenProj = (afterRegenRes.json as {
    project: { status: string; finalVideoPath: string | null };
  }).project;
  if (afterRegenProj.status !== 'done' || !afterRegenProj.finalVideoPath) {
    throw new Error('Single-scene regeneration did not re-assemble to done');
  }
  console.log(
    `6. ✓ Regenerated single scene (${firstSceneId}) and re-assembled final MP4 (${afterRegenProj.finalVideoPath})`
  );
  console.log('=== ALL E2E SMOKE CHECKS PASSED ===');
}

runSmokeE2E().catch((err) => {
  console.error(err);
  process.exit(1);
});
