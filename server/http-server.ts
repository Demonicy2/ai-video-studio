import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { handleApiRequest } from './api-router.ts';
import { getStorage } from './storage/adapter.ts';
import { processAvailableJobs } from './jobs/worker.ts';
import { ensureDemoUser } from '../prisma/seed.ts';
import { logger } from '../lib/logger.ts';

const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || '3000');

const CUSTOM_STUDIO_CSS = `
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  background-color: #06070d;
  color: #f8fafc;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.studio-bg {
  background-color: #06070d;
  background-image:
    radial-gradient(circle at 12% 14%, rgba(124, 58, 237, 0.16), transparent 38%),
    radial-gradient(circle at 88% 18%, rgba(6, 182, 212, 0.14), transparent 40%),
    radial-gradient(circle at 50% 90%, rgba(79, 70, 229, 0.12), transparent 45%);
  background-attachment: fixed;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #070911;
}
::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
`;

async function buildClientAssets(): Promise<{ clientJs: string; studioCss: string }> {
  const distDir = path.resolve(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outJs = path.join(distDir, 'client.js');
  const outCss = path.join(distDir, 'studio.css');

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
      `--outfile=${outJs}`,
    ],
    {
      env: {
        ...process.env,
        NODE_PATH: `${path.resolve(process.cwd(), 'node_modules')};${externalNodeModules}`,
      },
      stdio: 'inherit',
    }
  );

  // Compile real Tailwind CSS v3.4 with PostCSS scanning all components
  const postcss = require('postcss');
  const tailwindcss = require('tailwindcss');
  const cssResult = await postcss([
    tailwindcss({
      content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
      darkMode: 'class',
    }),
  ]).process(CUSTOM_STUDIO_CSS, { from: undefined });

  fs.writeFileSync(outCss, cssResult.css, 'utf-8');

  return {
    clientJs: fs.readFileSync(outJs, 'utf-8'),
    studioCss: cssResult.css,
  };
}

export async function startStudioServer(port = PORT) {
  await ensureDemoUser();
  const { clientJs, studioCss } = await buildClientAssets();

  const htmlPage = `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Video Studio Pro — Tạo Video AI Từ Kịch Bản</title>
  <link rel="stylesheet" href="/studio.css" />
</head>
<body class="studio-bg text-slate-100 antialiased">
  <div id="root"></div>
  <script src="/client.js"></script>
</body>
</html>`;

  const workerTimer = setInterval(() => {
    processAvailableJobs().catch(() => {});
  }, 800);

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);

    if (url.pathname === '/studio.css' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(studioCss);
      return;
    }

    if (url.pathname === '/client.js' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(clientJs);
      return;
    }

    // Stream large media files via fs.createReadStream with HTTP Range support
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

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage);
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      logger.info({ url: `http://localhost:${port}` }, 'AI Video Studio Pro server listening');
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
