import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

async function readFileOrNull(path) {
  try {
    if (!(await stat(path)).isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

// Serves the site the way GitHub Pages does: directories resolve to
// index.html and anything missing gets 404.html, so what you see locally
// matches what goes live.
export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    let rel = normalize(decodeURIComponent(pathname));
    if (rel.endsWith('/')) rel += 'index.html';
    rel = rel.replace(/^([/\\]|\.\.[/\\])+/, '');

    let path = join(ROOT, rel);
    let body = await readFileOrNull(path);
    let status = 200;

    if (!body) {
      path = join(ROOT, '404.html');
      body = await readFileOrNull(path);
      status = 404;
    }
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(status, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// `npm start` runs this file directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.env.PORT) || 8000);
  console.log(`Serving http://localhost:${port}`);
}
