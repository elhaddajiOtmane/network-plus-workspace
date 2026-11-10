import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root) || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain' });
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Invalid request');
  }
});
let port = Number(process.env.PORT || 4173);
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4273) { port++; server.listen(port, '127.0.0.1'); }
  else { console.error('Local server failed:', error.message); process.exitCode = 1; }
});
server.on('listening', () => console.log(`Network+ workspace: http://127.0.0.1:${server.address().port}`));
server.listen(port, '127.0.0.1');
