import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:');
const port = Number.parseInt(process.env.PORT ?? '4178', 10);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const route = pathname === '/' ? '/demo/index.html' : pathname;
  const relative = normalize(route).replace(/^([/\\])+/, '');
  const filePath = join(root, relative);
  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || !types.has(extname(filePath))) throw new Error('not found');
    response.writeHead(200, { 'Content-Type': types.get(extname(filePath)) });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Carousel demo: http://127.0.0.1:${port}/`);
});
