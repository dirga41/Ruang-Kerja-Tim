/**
 * Server real-time (WebSocket) untuk Ruang Kerja Tim.
 *
 * Saat server ini aktif, orkestrasi agent berjalan DI SERVER dan setiap
 * perubahan dikirim ke semua browser yang tersambung lewat WebSocket:
 *   - activity_logged          → streaming log aktivitas agent
 *   - agent_status_changed     → status, animasi, dan bubble tiap agent
 *   - stats_updated            → statistik header (dokumen, aksi, token, sesi)
 *   - roadmap_progress_updated, task_assigned, artifact_created,
 *     decision_logged, validation_updated, whiteboard_updated, session_ended
 *
 * Dipasang di dua tempat: server dev Vite (vite.config.ts) dan server
 * produksi mandiri (server/index.ts). Modul `ws` diberikan oleh pemanggil.
 */
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket, WebSocketServer } from 'ws';
import type { AgentId, ServerEvent } from '../src/shared/types';
import { Aborted, Session, type Engine, type SessionStore } from '../src/engine/session';
import { DemoEngine } from '../src/engine/demo';
import { LiveEngine, type CallModel } from '../src/engine/live';
import { readMessageStream } from '../src/engine/claudeClient';
import { resolveProvider } from '../src/engine/provider';
import claudeHandler from '../api/claude';

export const WS_PATH = '/ws';

/** Pesan dari browser ke server. `id` dikembalikan di `ack`/`error` agar klien tahu hasil perintahnya. */
type ClientMessage =
  | { type: 'start'; id?: string; brief?: string; password?: string }
  | { type: 'message'; id?: string; text?: string }
  | { type: 'stop'; id?: string };

const RETRYABLE = new Set([408, 429, 500, 502, 504, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Satu giliran model: memakai handler /api/claude yang sama dengan mode tanpa WebSocket. */
const callModel: CallModel = async (agent: AgentId, messages, signal) => {
  let lastError = 'Permintaan gagal';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    if (signal.aborted) throw new Aborted();
    const res = await claudeHandler(
      new Request('http://internal/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-password': process.env.APP_PASSWORD ?? '' },
        body: JSON.stringify({ agent, messages }),
      }),
    );
    if (res.ok && res.body) return readMessageStream(res.body);
    const data: any = await res.json().catch(() => ({}));
    lastError = data.error ?? `Permintaan gagal (${res.status})`;
    if (!RETRYABLE.has(res.status)) break;
  }
  throw new Error(lastError);
};

const memoryStore: SessionStore = { saveSnapshot() {}, insertActivity() {}, insertArtifact() {}, insertDecision() {}, upsertTask() {} };

export interface RealtimeOptions {
  /** konstruktor dari paket `ws` */
  WebSocketServer: new (opts: { noServer: true }) => WebSocketServer;
  log?: (msg: string) => void;
}

export function attachRealtime(httpServer: HttpServer, opts: RealtimeOptions) {
  const log = opts.log ?? (() => {});
  const wss = new opts.WebSocketServer({ noServer: true });
  const demoEngine = new DemoEngine();
  const liveEngine = new LiveEngine(callModel);
  const alive = new WeakMap<WebSocket, boolean>();
  let current: Session | null = null;

  const mode = (): 'demo' | 'live' => (resolveProvider(process.env) ? 'live' : 'demo');
  const engineFor = (m: 'demo' | 'live'): Engine => (m === 'live' ? liveEngine : demoEngine);
  const demoSpeed = () => Math.max(0.25, Number(process.env.DEMO_SPEED ?? process.env.VITE_DEMO_SPEED ?? 1) || 1);
  const allowedOrigins = () => (process.env.WS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data);
  };
  const hello = () => {
    const provider = resolveProvider(process.env);
    return { type: 'hello', payload: { mode: mode(), model: provider?.model ?? null, locked: !!provider && !!process.env.APP_PASSWORD, viewers: wss.clients.size } };
  };

  function drive(session: Session, job: Promise<void>) {
    const engine = engineFor(session.state.mode);
    (async () => {
      await job;
      while (session.inbox.length && !session.aborted) await engine.resume(session);
      session.finish(true);
    })().catch((err) => {
      if (err instanceof Aborted || session.aborted) return;
      log(`galat orkestrator: ${err?.message ?? err}`);
      session.log('sistem', 'sistem', `Terjadi galat: ${err?.message ?? err}`);
      session.finish(false);
    });
  }

  function handle(ws: WebSocket, msg: ClientMessage) {
    const ack = () => send(ws, { type: 'ack', id: msg.id });
    const fail = (message: string) => send(ws, { type: 'error', id: msg.id, payload: { message } });

    if (msg.type === 'start') {
      const brief = String(msg.brief ?? '').trim();
      if (!brief) return fail('Brief proyek wajib diisi.');
      if (brief.length > 4000) return fail('Brief terlalu panjang (maks. 4000 karakter).');
      const m = mode();
      if (m === 'live' && process.env.APP_PASSWORD && msg.password !== process.env.APP_PASSWORD) return fail('Kata sandi aplikasi salah.');
      current?.abort();
      const session = new Session(brief, m, memoryStore, (ev: ServerEvent) => broadcast(ev), m === 'demo' ? demoSpeed() : 1);
      current = session;
      broadcast({ type: 'snapshot', payload: { session: session.state, mode: m } });
      session.log('pengguna', 'pengguna', `Brief proyek: ${brief}`);
      drive(session, engineFor(m).run(session));
      log(`sesi ${session.state.id} dimulai (${m}): ${brief.slice(0, 60)}`);
      return ack();
    }
    if (msg.type === 'message') {
      const text = String(msg.text ?? '').trim();
      if (!text) return fail('Pesan kosong.');
      if (!current) return fail('Belum ada sesi aktif. Mulai dengan brief proyek.');
      const session = current;
      session.log('pengguna', 'pengguna', text);
      session.inbox.push(text);
      if (!session.state.running) {
        session.reopen();
        drive(session, engineFor(session.state.mode).resume(session));
      }
      return ack();
    }
    if (msg.type === 'stop') {
      if (current?.state.running) {
        const s = current;
        s.abort();
        s.log('sistem', 'sistem', 'Sesi dihentikan oleh pengguna.');
        s.finish(false);
      }
      return ack();
    }
    fail('Perintah tidak dikenal.');
  }

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    send(ws, hello());
    send(ws, { type: 'snapshot', payload: { session: current?.state ?? null, mode: mode() } });
    broadcast({ type: 'viewers', payload: wss.clients.size });
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        const text = raw.toString();
        if (text.length > 20_000) throw new Error('terlalu besar');
        msg = JSON.parse(text);
      } catch {
        return send(ws, { type: 'error', payload: { message: 'Pesan tidak valid.' } });
      }
      try {
        handle(ws, msg);
      } catch (err: any) {
        send(ws, { type: 'error', id: (msg as any)?.id, payload: { message: String(err?.message ?? err) } });
      }
    });
    ws.on('close', () => broadcast({ type: 'viewers', payload: wss.clients.size }));
    ws.on('error', () => ws.terminate());
  });

  // Hanya tangani upgrade di /ws; jalur lain (mis. HMR Vite) dibiarkan untuk handler lain.
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return;
    const allow = allowedOrigins();
    if (allow.length && !allow.includes(String(req.headers.origin ?? ''))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  httpServer.on('upgrade', onUpgrade);

  // Detak jantung: putuskan koneksi yang tidak menjawab ping.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  log(`WebSocket siap di ${WS_PATH}`);
  return {
    close() {
      clearInterval(heartbeat);
      httpServer.off('upgrade', onUpgrade);
      current?.abort();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
