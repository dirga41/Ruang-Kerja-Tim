import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { WebSocketServer } from 'ws';
import { attachRealtime } from './server/realtime';

/**
 * Menjalankan fungsi di folder /api saat `npm run dev`, supaya perilaku lokal
 * sama dengan di Vercel tanpa perlu `vercel dev`. Plugin ini juga memasang
 * server real-time (WebSocket) dari server/realtime.ts. Fungsi-fungsi itu memakai
 * antarmuka web standar (Request → Response).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      // WebSocket /ws menumpang di server dev yang sama (port 5173), jadi tidak perlu proses kedua.
      if (server.httpServer) {
        const rt = attachRealtime(server.httpServer as import('node:http').Server, {
          WebSocketServer,
          log: (m) => server.config.logger.info(`  [realtime] ${m}`),
        });
        server.httpServer.once('close', () => rt.close());
      }
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const name = path.startsWith('/api/') ? path.slice(5) : '';
        if (!/^[a-z]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(`http://localhost${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
          const response: Response = await mod.default(request);
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
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env dimuat ke process.env agar fungsi /api bisa membaca ANTHROPIC_API_KEY saat dev
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), devApi()],
    server: { port: 5173 },
    build: { chunkSizeWarningLimit: 2500 },
  };
});
