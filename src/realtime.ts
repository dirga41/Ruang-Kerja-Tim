/**
 * Klien WebSocket untuk fitur real-time.
 *
 * - Mencoba tersambung ke server real-time (VITE_WS_URL, atau /ws di origin yang sama).
 * - Bila berhasil, semua event sesi datang dari server lewat WebSocket.
 * - Bila gagal pada percobaan pertama (mis. di Vercel, yang tidak mendukung
 *   WebSocket), pemanggil diberi tahu agar memakai mode lokal di browser.
 * - Setelah pernah tersambung, koneksi yang putus disambung ulang otomatis.
 */
export interface RealtimeHandlers {
  /** event dari server (snapshot, activity_logged, agent_status_changed, stats_updated, hello, viewers, …) */
  onEvent: (ev: { type: string; payload?: any }) => void;
  /** dipanggil tiap status koneksi berubah setelah koneksi pertama berhasil */
  onStatus: (connected: boolean) => void;
}

export interface Realtime {
  /** kirim perintah dan tunggu `ack`/`error` dari server */
  request: (msg: Record<string, unknown>) => Promise<void>;
  close: () => void;
}

function wsUrl(): string {
  const custom = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (custom) return custom;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** true bila alamat server real-time diisi lewat VITE_WS_URL (server terpisah dari frontend). */
export const hasRemoteRealtime = () => {
  const v = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  return !!v && v !== 'off';
};

/**
 * Mengembalikan `null` bila server real-time tidak tersedia.
 *
 * Server terpisah di hosting gratis biasanya "tidur" saat tidak dipakai dan butuh
 * puluhan detik untuk bangun. Karena itu, bila VITE_WS_URL diisi, percobaan
 * pertama diulang sampai `wakeBudgetMs` sebelum menyerah ke mode lokal.
 */
export function openRealtime(handlers: RealtimeHandlers, wakeBudgetMs = 90_000): Promise<Realtime | null> {
  if ((import.meta.env.VITE_WS_URL as string | undefined)?.trim() === 'off') return Promise.resolve(null);
  const url = wsUrl();
  const remote = hasRemoteRealtime();
  const deadline = Date.now() + (remote ? wakeBudgetMs : 0);
  const attemptTimeoutMs = remote ? 10_000 : 2500;
  if (remote) {
    // permintaan HTTP biasa ikut membangunkan server yang sedang tidur
    void fetch(url.replace(/^ws/, 'http').replace(/\/ws$/, '/api/health'), { mode: 'no-cors' }).catch(() => undefined);
  }
  const pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let socket: WebSocket | null = null;
  let closed = false;
  let everOpened = false;
  let retry = 0;
  let seq = 0;

  const failAll = (reason: string) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  };

  const api: Realtime = {
    request(msg) {
      return new Promise<void>((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('Koneksi ke server terputus. Coba lagi sebentar lagi.'));
        const id = `c${++seq}`;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Server tidak menjawab.'));
        }, 10_000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ ...msg, id }));
      });
    },
    close() {
      closed = true;
      socket?.close();
    },
  };

  return new Promise<Realtime | null>((resolveFirst) => {
    let settled = false;
    const settle = (value: Realtime | null) => {
      if (settled) return;
      settled = true;
      resolveFirst(value);
    };

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        settle(null);
        return;
      }
      socket = ws;
      // percobaan yang menggantung ditutup; `onclose` memutuskan apakah dicoba lagi
      const firstTimer = everOpened ? null : setTimeout(() => {
        if (!everOpened) ws.close();
      }, attemptTimeoutMs);

      ws.onopen = () => {
        if (firstTimer) clearTimeout(firstTimer);
        everOpened = true;
        retry = 0;
        handlers.onStatus(true);
        settle(api);
      };
      ws.onmessage = (e) => {
        let ev: any;
        try {
          ev = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (ev.type === 'ack' || (ev.type === 'error' && ev.id)) {
          const p = pending.get(ev.id);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(ev.id);
            if (ev.type === 'ack') p.resolve();
            else p.reject(new Error(ev.payload?.message ?? 'Permintaan ditolak server.'));
          }
          return;
        }
        handlers.onEvent(ev);
      };
      ws.onclose = () => {
        if (firstTimer) clearTimeout(firstTimer);
        if (socket === ws) socket = null;
        failAll('Koneksi ke server terputus.');
        if (!everOpened) {
          if (!settled && Date.now() < deadline) {
            setTimeout(connect, 3000); // server terpisah mungkin masih bangun dari tidur
            return;
          }
          closed = true;
          settle(null); // server real-time tidak ada → mode lokal
          return;
        }
        handlers.onStatus(false);
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 400 * 2 ** retry);
      };
      ws.onerror = () => ws.close();
    };
    connect();
  });
}
