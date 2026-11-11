import { prisma } from '../lib/db.ts';
import {
  checkAndConsumeDailyQuota,
  checkStoryboardRateLimit,
  createSessionToken,
  getUserFromCookieHeader,
  hashPassword,
  makeLogoutCookie,
  makeSessionCookie,
  verifyPassword,
} from '../lib/auth.ts';
import {
  AuthInputSchema,
  CreateProjectInputSchema,
  UpdateSceneInputSchema,
} from '../lib/validators.ts';
import {
  enqueueJob,
  enqueueProjectGenerationJobs,
  enqueueSingleSceneRegeneration,
} from './jobs/queue.ts';
import { processAvailableJobs } from './jobs/worker.ts';
import { ensureDemoUser } from '../prisma/seed.ts';
import { getStorage } from './storage/adapter.ts';
import { sanitizeFilename } from '../lib/utils.ts';

export interface ApiRequestContext {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponsePayload {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  rawBuffer?: Buffer;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export async function handleApiRequest(req: ApiRequestContext): Promise<ApiResponsePayload> {
  const { method, pathname } = req;
  const cookieHeader = req.headers['cookie'] || req.headers['Cookie'];

  try {
    // 1. Auth Endpoints
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = await getUserFromCookieHeader(cookieHeader);
      if (!user) return { status: 401, json: { error: 'Unauthorized' } };
      return {
        status: 200,
        json: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            dailyQuotaUsed: user.dailyQuotaUsed,
            dailyQuotaLimit: Number(process.env.DAILY_SCENE_QUOTA || '30'),
          },
        },
      };
    }

    if (pathname === '/api/auth/demo' && method === 'POST') {
      const demo = await ensureDemoUser();
      const token = createSessionToken(demo);
      return {
        status: 200,
        headers: { 'Set-Cookie': makeSessionCookie(token) },
        json: {
          user: { id: demo.id, email: demo.email, name: demo.name },
        },
      };
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const parsed = AuthInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return { status: 400, json: { error: parsed.error.message } };
      }
      const { email, password, name } = parsed.data;
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return { status: 409, json: { error: 'Email already registered' } };
      }
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          passwordHash: hashPassword(password),
        },
      });
      const token = createSessionToken(user);
      return {
        status: 201,
        headers: { 'Set-Cookie': makeSessionCookie(token) },
        json: { user: { id: user.id, email: user.email, name: user.name } },
      };
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const parsed = AuthInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return { status: 400, json: { error: parsed.error.message } };
      }
      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return { status: 401, json: { error: 'Invalid email or password' } };
      }
      const token = createSessionToken(user);
      return {
        status: 200,
        headers: { 'Set-Cookie': makeSessionCookie(token) },
        json: { user: { id: user.id, email: user.email, name: user.name } },
      };
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return {
        status: 200,
        headers: { 'Set-Cookie': makeLogoutCookie() },
        json: { ok: true },
      };
    }

    // All routes below require an authenticated user
    const user = await getUserFromCookieHeader(cookieHeader);
    if (!user) {
      return { status: 401, json: { error: 'Authentication required' } };
    }

    // 2. Character Reference Image Upload (validates MIME type and max 5 MB size)
    if (pathname === '/api/uploads/image' && method === 'POST') {
      const body = (req.body || {}) as {
        filename?: string;
        mimeType?: string;
        base64Data?: string;
      };
      if (!body.filename || !body.mimeType || !body.base64Data) {
        return { status: 400, json: { error: 'Missing filename, mimeType, or base64Data' } };
      }
      if (!ALLOWED_IMAGE_MIMES.has(body.mimeType.toLowerCase())) {
        return { status: 400, json: { error: 'Unsupported image type. Allowed: PNG, JPEG, WEBP' } };
      }
      const cleanBase64 = body.base64Data.replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length > MAX_UPLOAD_BYTES) {
        return { status: 413, json: { error: 'Image exceeds maximum size of 5 MB' } };
      }
      const safeName = sanitizeFilename(body.filename);
      const storage = getStorage();
      const relPath = await storage.saveFile(`uploads/${user.id}/${Date.now()}_${safeName}`, buf);
      return {
        status: 201,
        json: { path: relPath, url: storage.getPublicUrl(relPath) },
      };
    }

    // 3. Projects list & create
    if (pathname === '/api/projects' && method === 'GET') {
      const projects = await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          scenes: { orderBy: { index: 'asc' } },
          characters: true,
        },
      });
      return { status: 200, json: { projects } };
    }

    if (pathname === '/api/projects' && method === 'POST') {
      const parsed = CreateProjectInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return { status: 400, json: { error: parsed.error.message } };
      }
      const rateCheck = checkStoryboardRateLimit(user.id);
      if (!rateCheck.allowed) {
        return {
          status: 429,
          json: {
            error: `Rate limit exceeded (max ${process.env.STORYBOARD_HOURLY_LIMIT || 5} storyboards/hour). Try again in ${rateCheck.retryAfterSec}s.`,
          },
        };
      }

      const data = parsed.data;
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          title: data.title,
          sourceType: data.sourceType,
          sourceText: data.sourceText,
          language: data.language,
          aspectRatio: data.aspectRatio,
          targetDurationSec: data.targetDurationSec,
          style: data.style,
          status: 'draft',
          characters: {
            create: data.characters.map((c) => ({
              name: c.name,
              description: c.description,
              referenceImagePath: c.referenceImagePath || null,
            })),
          },
        },
        include: { characters: true, scenes: true },
      });

      // Automatically enqueue storyboard job and trigger background worker
      await enqueueJob('storyboard', { projectId: project.id });
      setImmediate(() => {
        processAvailableJobs().catch(() => {});
      });

      return { status: 201, json: { project } };
    }

    // 4. Single Project operations: /api/projects/:id...
    const projMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (projMatch) {
      const projectId = projMatch[1];
      const subRoute = projMatch[2] || '';

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          scenes: { orderBy: { index: 'asc' } },
          characters: true,
          assets: true,
          jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      // Enforce ownership check on every project query
      if (!project || project.userId !== user.id) {
        return { status: 404, json: { error: 'Project not found' } };
      }

      if (!subRoute && method === 'GET') {
        return {
          status: 200,
          json: {
            project,
            costPerSecondUsd: Number(process.env.ESTIMATED_COST_PER_SECOND_USD || '0.05'),
          },
        };
      }

      if (!subRoute && method === 'DELETE') {
        await prisma.project.delete({ where: { id: projectId } });
        return { status: 200, json: { ok: true } };
      }

      // Trigger / Regenerate Storyboard
      if (subRoute === 'storyboard' && method === 'POST') {
        const rateCheck = checkStoryboardRateLimit(user.id);
        if (!rateCheck.allowed) {
          return {
            status: 429,
            json: { error: `Rate limit exceeded. Retry in ${rateCheck.retryAfterSec}s` },
          };
        }
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'draft', lastError: null },
        });
        await enqueueJob('storyboard', { projectId });
        setImmediate(() => {
          processAvailableJobs().catch(() => {});
        });
        return { status: 202, json: { status: 'queued' } };
      }

      // Add a new Scene (allowed when not actively generating)
      if (subRoute === 'scenes' && method === 'POST') {
        if (project.status === 'generating' || project.status === 'assembling') {
          return { status: 400, json: { error: 'Cannot add scenes while generation is in progress' } };
        }
        const body = (req.body || {}) as Partial<{
          title: string;
          narration: string;
          visualPrompt: string;
          cameraMotion: string;
          durationSec: number;
        }>;
        const nextIndex = project.scenes.length;
        const newScene = await prisma.scene.create({
          data: {
            projectId,
            index: nextIndex,
            title: body.title || `Scene #${nextIndex + 1}`,
            narration: body.narration || '',
            dialogue: JSON.stringify([
              {
                speaker: project.characters[0]?.name || 'Narrator',
                text: body.narration || 'Lời thoại phân cảnh mới.',
                language: project.language === 'en' ? 'en' : 'vi',
              },
            ]),
            visualPrompt:
              body.visualPrompt ||
              `Subject: main character. Action: dramatic moment in scene ${nextIndex + 1}. Setting: cinematic environment. Lighting: soft volumetric lighting. Camera angle: medium shot. Camera motion: static. Style: ${project.style}. Mood: engaging.`,
            cameraMotion: body.cameraMotion || 'static',
            durationSec: body.durationSec || 5,
            status: 'pending',
          },
        });
        return { status: 201, json: { scene: newScene } };
      }

      // Reorder Scenes
      if (subRoute === 'scenes/reorder' && method === 'POST') {
        if (project.status === 'generating' || project.status === 'assembling') {
          return { status: 400, json: { error: 'Cannot reorder scenes during generation' } };
        }
        const { sceneIds } = (req.body || {}) as { sceneIds?: string[] };
        if (!Array.isArray(sceneIds)) {
          return { status: 400, json: { error: 'sceneIds array required' } };
        }
        for (let i = 0; i < sceneIds.length; i++) {
          const target = project.scenes.find((s: { id: string }) => s.id === sceneIds[i]);
          if (target) {
            await prisma.scene.update({
              where: { id: target.id },
              data: { index: i },
            });
          }
        }
        const updatedScenes = await prisma.scene.findMany({
          where: { projectId },
          orderBy: { index: 'asc' },
        });
        return { status: 200, json: { scenes: updatedScenes } };
      }

      // Edit or Delete or Regenerate a specific Scene: /api/projects/:id/scenes/:sceneId[/regenerate]
      const sceneMatch = subRoute.match(/^scenes\/([^/]+)(?:\/(regenerate))?$/);
      if (sceneMatch) {
        const sceneId = sceneMatch[1];
        const action = sceneMatch[2];
        const existingScene = project.scenes.find((s: { id: string }) => s.id === sceneId);
        if (!existingScene) {
          return { status: 404, json: { error: 'Scene not found' } };
        }

        if (action === 'regenerate' && method === 'POST') {
          const quota = await checkAndConsumeDailyQuota(user.id, 1);
          if (!quota.allowed) {
            return { status: 429, json: { error: 'Daily scene generation quota exceeded' } };
          }
          await enqueueSingleSceneRegeneration(projectId, sceneId);
          setImmediate(() => {
            processAvailableJobs().catch(() => {});
          });
          return { status: 202, json: { status: 'regenerating_scene', sceneId } };
        }

        if (!action && (method === 'PATCH' || method === 'PUT')) {
          const parsed = UpdateSceneInputSchema.safeParse(req.body);
          if (!parsed.success) {
            return { status: 400, json: { error: parsed.error.message } };
          }
          const d = parsed.data;
          const updated = await prisma.scene.update({
            where: { id: sceneId },
            data: {
              title: d.title,
              narration: d.narration,
              dialogue: d.dialogue ? JSON.stringify(d.dialogue) : undefined,
              visualPrompt: d.visualPrompt,
              negativePrompt: d.negativePrompt,
              cameraMotion: d.cameraMotion,
              durationSec: d.durationSec,
              index: d.index,
            },
          });
          return { status: 200, json: { scene: updated } };
        }

        if (!action && method === 'DELETE') {
          await prisma.scene.delete({ where: { id: sceneId } });
          const remaining = await prisma.scene.findMany({
            where: { projectId },
            orderBy: { index: 'asc' },
          });
          for (let i = 0; i < remaining.length; i++) {
            await prisma.scene.update({ where: { id: remaining[i].id }, data: { index: i } });
          }
          return { status: 200, json: { scenes: remaining } };
        }
      }

      // Approve Storyboard & Generate Full Video
      if (subRoute === 'generate' && method === 'POST') {
        if (project.scenes.length === 0) {
          return { status: 400, json: { error: 'No scenes in storyboard' } };
        }
        const quota = await checkAndConsumeDailyQuota(user.id, project.scenes.length);
        if (!quota.allowed) {
          return {
            status: 429,
            json: { error: `Daily scene generation quota exceeded (remaining: ${quota.remaining})` },
          };
        }

        await enqueueProjectGenerationJobs(projectId);
        setImmediate(() => {
          processAvailableJobs().catch(() => {});
        });

        return { status: 202, json: { status: 'generating', remainingQuota: quota.remaining } };
      }
    }

    return { status: 404, json: { error: `Route not found: ${method} ${pathname}` } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, json: { error: message } };
  }
}

