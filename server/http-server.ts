import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleApiRequest } from './api-router.ts';
import { getStorage } from './storage/adapter.ts';
import { processAvailableJobs } from './jobs/worker.ts';
import { ensureDemoUser } from '../prisma/seed.ts';
import { logger } from '../lib/logger.ts';

const PORT = Number(process.env.PORT || '3000');

function buildClientBundle(): string {
  const distDir = path.resolve(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outFile = path.join(distDir, 'client.js');

  const esbuildCandidates = [
    path.resolve(process.cwd(), 'node_modules/@esbuild/win32-x64/esbuild.exe'),
    'C:\\Users\\admin\\AppData\\Local\\Programs\\Antigravity IDE\\resources\\app\\node_modules\\@esbuild\\win32-x64\\esbuild.exe',
  ];
  const esbuildBin = esbuildCandidates.find((p) => fs.existsSync(p)) || 'esbuild';
  const externalNodeModules =
    'C:\\Users\\admin\\AppData\\Local\\Programs\\Antigravity IDE\\resources\\app\\node_modules';

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
      stdio: 'inherit',
    }
  );

  return fs.readFileSync(outFile, 'utf-8');
}

const EMBEDDED_STYLES = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background-color: #020617; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
.min-h-screen { min-height: 100vh; }
.bg-slate-950 { background-color: #020617; }
.bg-slate-950\\/90 { background-color: rgba(2, 6, 23, 0.92); }
.bg-slate-950\\/60 { background-color: rgba(2, 6, 23, 0.6); }
.bg-slate-900 { background-color: #0f172a; }
.bg-slate-900\\/90 { background-color: rgba(15, 23, 42, 0.92); }
.bg-slate-800 { background-color: #1e293b; }
.bg-indigo-600 { background-color: #4f46e5; }
.bg-indigo-600:hover, .hover\\:bg-indigo-500:hover { background-color: #6366f1; }
.bg-indigo-600\\/20 { background-color: rgba(79, 70, 229, 0.2); }
.bg-indigo-500\\/15 { background-color: rgba(99, 102, 241, 0.15); }
.bg-indigo-500\\/10 { background-color: rgba(99, 102, 241, 0.1); }
.bg-emerald-500\\/15 { background-color: rgba(16, 185, 129, 0.15); }
.bg-amber-500\\/15 { background-color: rgba(245, 158, 11, 0.15); }
.bg-rose-500\\/15 { background-color: rgba(244, 63, 94, 0.15); }
.bg-rose-600\\/90 { background-color: rgba(225, 29, 72, 0.9); }
.bg-black { background-color: #000000; }
.bg-black\\/80 { background-color: rgba(0,0,0,0.8); }
.text-white { color: #ffffff; }
.text-slate-100 { color: #f1f5f9; }
.text-slate-200 { color: #e2e8f0; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-slate-500 { color: #64748b; }
.text-indigo-200 { color: #c7d2fe; }
.text-indigo-300 { color: #a5b4fc; }
.text-indigo-400 { color: #818cf8; }
.text-emerald-300 { color: #6ee7b7; }
.text-amber-300 { color: #fcd34d; }
.text-rose-300 { color: #fda4af; }
.text-rose-400 { color: #fb7185; }
.text-yellow-300 { color: #fde047; }
.border { border: 1px solid #1e293b; }
.border-b { border-bottom: 1px solid #1e293b; }
.border-t { border-top: 1px solid #1e293b; }
.border-slate-800 { border-color: #1e293b; }
.border-slate-700 { border-color: #334155; }
.border-indigo-500 { border-color: #6366f1; }
.rounded { border-radius: 0.25rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.p-5 { padding: 1.25rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.p-10 { padding: 2.5rem; }
.p-12 { padding: 3rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-3\\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
.py-6 { padding-top: 1.5rem; padding-bottom: 1.5rem; }
.pb-3 { padding-bottom: 0.75rem; }
.pb-4 { padding-bottom: 1rem; }
.pt-2 { padding-top: 0.5rem; }
.pt-4 { padding-top: 1rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-1\\.5 { margin-bottom: 0.375rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-6 { margin-bottom: 1.5rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-4 { margin-top: 1rem; }
.mx-auto { margin-left: auto; margin-right: auto; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.block { display: block; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-1 { flex: 1 1 0%; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-2\\.5 { gap: 0.625rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.gap-6 { gap: 1.5rem; }
.space-y-1 > * + * { margin-top: 0.25rem; }
.space-y-2 > * + * { margin-top: 0.5rem; }
.space-y-3 > * + * { margin-top: 0.75rem; }
.space-y-4 > * + * { margin-top: 1rem; }
.space-y-5 > * + * { margin-top: 1.25rem; }
.space-y-6 > * + * { margin-top: 1.5rem; }
.w-full { width: 100%; }
.max-w-md { max-width: 28rem; }
.max-w-2xl { max-width: 42rem; }
.max-w-6xl { max-width: 72rem; }
.max-w-\\[280px\\] { max-width: 280px; }
.h-2\\.5 { height: 0.625rem; }
.h-7 { height: 1.75rem; }
.w-7 { width: 1.75rem; }
.h-9 { height: 2.25rem; }
.w-9 { width: 2.25rem; }
.h-10 { height: 2.5rem; }
.w-10 { width: 2.5rem; }
.h-12 { height: 3rem; }
.w-12 { width: 3rem; }
.h-24 { height: 6rem; }
.h-28 { height: 7rem; }
.h-48 { height: 12rem; }
.h-full { height: 100%; }
.text-xs { font-size: 0.75rem; }
.text-sm { font-size: 0.875rem; }
.text-base { font-size: 1rem; }
.text-lg { font-size: 1.125rem; }
.text-xl { font-size: 1.25rem; }
.text-2xl { font-size: 1.5rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-center { text-align: center; }
.text-left { text-align: left; }
.cursor-pointer { cursor: pointer; }
.overflow-hidden { overflow: hidden; }
.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.sticky { position: sticky; }
.top-0 { top: 0; }
.bottom-5 { bottom: 1.25rem; }
.right-5 { right: 1.25rem; }
.bottom-12 { bottom: 3rem; }
.inset-x-3 { left: 0.75rem; right: 0.75rem; }
.z-30 { z-index: 30; }
.z-50 { z-index: 50; }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.aspect-\\[9\\/16\\] { aspect-ratio: 9 / 16; }
.aspect-video { aspect-ratio: 16 / 9; }
.aspect-square { aspect-ratio: 1 / 1; }
.hidden { display: none; }
.inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
.my-auto { margin-top: auto; margin-bottom: auto; }
.object-contain { object-fit: contain; }
.pointer-events-none { pointer-events: none; }
.max-h-48 { max-height: 12rem; }
.overflow-y-auto { overflow-y: auto; }
.line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
.line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.line-clamp-3 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
.hover\\:underline:hover { text-decoration: underline; }
.disabled\\:opacity-50:disabled { opacity: 0.5; }
.disabled\\:pointer-events-none:disabled { pointer-events: none; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.bg-gradient-to-r { background-image: linear-gradient(to right, #6366f1, #8b5cf6); }
.bg-gradient-to-br { background-image: linear-gradient(to bottom right, #1e1b4b, #0f172a, #2e1065); }
@media (min-width: 768px) {
  .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .lg\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lg\\:grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .lg\\:col-span-5 { grid-column: span 5 / span 5; }
  .lg\\:col-span-7 { grid-column: span 7 / span 7; }
}
@media (min-width: 640px) {
  .sm\\:flex-row { flex-direction: row; }
  .sm\\:items-center { align-items: center; }
  .sm\\:px-8 { padding-left: 2rem; padding-right: 2rem; }
}
button, input, textarea, select { font-family: inherit; }
a { text-decoration: none; }
`;

export async function startStudioServer(port = PORT) {
  await ensureDemoUser();
  const clientJs = buildClientBundle();

  const htmlPage = `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Video Studio — Tạo video AI từ kịch bản</title>
  <style>${EMBEDDED_STYLES}</style>
</head>
<body>
  <div id="root"></div>
  <script src="/client.js"></script>
</body>
</html>`;

  // Start background worker loop in-process for convenient single-command dev/test execution
  const workerTimer = setInterval(() => {
    processAvailableJobs().catch(() => {});
  }, 800);

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);

    if (url.pathname === '/client.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(clientJs);
      return;
    }

    // Stream large media files via fs.createReadStream with HTTP Range support (never buffer full videos in memory)
    if (url.pathname.startsWith('/api/storage/')) {
      const relPath = decodeURIComponent(url.pathname.replace(/^\/api\/storage\//, ''));
      const storage = getStorage();
      if (!(await storage.exists(relPath))) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Asset not found' }));
        return;
      }

      const absPath = storage.getAbsolutePath(relPath);
      const stat = fs.statSync(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mime =
        ext === '.mp4'
          ? 'video/mp4'
          : ext === '.wav'
          ? 'audio/wav'
          : ext === '.mp3'
          ? 'audio/mpeg'
          : ext === '.srt' || ext === '.ass'
          ? 'text/plain; charset=utf-8'
          : ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';

      const headers: Record<string, string | number> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      };
      if (url.searchParams.get('download') === '1') {
        headers['Content-Disposition'] = `attachment; filename="${path.basename(absPath)}"`;
      }

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunkSize,
        });
        fs.createReadStream(absPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          ...headers,
          'Content-Length': stat.size,
        });
        fs.createReadStream(absPath).pipe(res);
      }
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      let parsedBody: unknown = undefined;
      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {}
      }

      const apiRes = await handleApiRequest({
        method: req.method || 'GET',
        pathname: url.pathname,
        searchParams: url.searchParams,
        headers: req.headers as Record<string, string | undefined>,
        body: parsedBody,
      });

      res.writeHead(apiRes.status, {
        'Content-Type': 'application/json; charset=utf-8',
        ...(apiRes.headers || {}),
      });
      res.end(JSON.stringify(apiRes.json ?? {}));
      return;
    }

    // Serve SPA HTML shell
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage);
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      logger.info({ url: `http://localhost:${port}` }, 'AI Video Studio server listening');
      resolve();
    });
  });

  return {
    server,
    close: async () => {
      clearInterval(workerTimer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

if (process.argv[1]?.endsWith('http-server.ts')) {
  startStudioServer(PORT);
}
