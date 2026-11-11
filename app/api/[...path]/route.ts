import { handleApiRequest } from '../../../server/api-router.ts';
import { getStorage } from '../../../server/storage/adapter.ts';
import fs from 'node:fs';

async function dispatch(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/storage/')) {
    const relPath = decodeURIComponent(url.pathname.replace(/^\/api\/storage\//, ''));
    const storage = getStorage();
    if (!(await storage.exists(relPath))) {
      return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 });
    }
    const absPath = storage.getAbsolutePath(relPath);
    const buf = fs.readFileSync(absPath);
    const ext = relPath.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'mp4'
        ? 'video/mp4'
        : ext === 'wav'
        ? 'audio/wav'
        : ext === 'mp3'
        ? 'audio/mpeg'
        : ext === 'srt' || ext === 'ass'
        ? 'text/plain; charset=utf-8'
        : 'application/octet-stream';
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': mime },
    });
  }

  let body: unknown = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.json();
    } catch {}
  }

  const headersObj: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

  const res = await handleApiRequest({
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers: headersObj,
    body,
  });

  return new Response(JSON.stringify(res.json ?? {}), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      ...(res.headers || {}),
    },
  });
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;

