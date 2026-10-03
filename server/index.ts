/**
 * Server produksi mandiri: menyajikan hasil build (dist), fungsi /api, dan
 * WebSocket /ws dalam satu proses. Pakai ini di host yang mendukung proses
 * berumur panjang (VPS, Railway, Render, Fly.io) — bukan di Vercel.
 *
 *   npm run build && npm start
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import claude from '../api/claude';
import health from '../api/health';
import { attachRealtime } from './realtime';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Muat .env sederhana (tanpa dependensi tambahan); variabel yang sudah ada tidak ditimpa.
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  /* .env opsional */
}

const PORT = Number(process.env.PORT ?? 8787);
const dist = path.join(root, 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const handlers: Record<string, (req: Request) => Response | Promise<Response>> = { claude, health };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const fn = handlers[url.pathname.slice(5)];
      if (!fn) {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const response = await fn(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }));
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }
    // berkas statis + fallback ke index.html
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Server real-time Ruang Kerja Tim aktif. WebSocket: /ws. (Folder dist tidak ada, jadi halaman web tidak disajikan dari sini.)');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String((err as Error)?.message ?? err) }));
  }
});

attachRealtime(server, { WebSocketServer, log: (m) => console.log(`  [realtime] ${m}`) });

server.listen(PORT, () => {
  console.log(`\n  Ruang Kerja Tim siap di http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws\n`);
});
