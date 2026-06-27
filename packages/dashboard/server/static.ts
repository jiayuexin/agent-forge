import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createError, defineEventHandler, getRequestPath, send, setResponseHeader } from 'h3';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

export interface StaticFileOptions {
  staticDir: string;
}

export function createStaticHandler(options: StaticFileOptions) {
  const root = resolve(options.staticDir);

  return defineEventHandler(async (event) => {
    const rawPath = getRequestPath(event).split('?')[0] ?? '/';

    if (rawPath.startsWith('/api/') || rawPath.startsWith('/ws')) {
      return;
    }

    const relativePath = rawPath === '/' ? 'index.html' : `.${rawPath}`;
    const filePath = resolve(root, relativePath);

    if (!filePath.startsWith(root)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
    }

    try {
      const content = await readFile(filePath);
      const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
      setResponseHeader(event, 'Content-Type', mime);
      return send(event, content);
    } catch {
      const indexHtml = await readFile(resolve(root, 'index.html'));
      setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8');
      return send(event, indexHtml);
    }
  });
}
