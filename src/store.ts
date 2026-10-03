import { create } from 'zustand';
import type { AgentId, ServerEvent, SessionState } from './shared/types';
import { Aborted, Session, type Engine } from './engine/session';
import { DemoEngine } from './engine/demo';
import { LiveEngine } from './engine/live';
import { createClaudeCaller } from './engine/claudeClient';
import { browserStore, loadLastSession } from './engine/storage';
import { hasRemoteRealtime, openRealtime, type Realtime } from './realtime';

export type TabId = 'roadmap' | 'keputusan' | 'output' | 'validasi';
export type CameraPreset = 'isometrik' | 'depan' | 'papan' | 'atas';

/** Feed hanya menyimpan 30 entri terbaru. */
export const FEED_LIMIT = 30;

interface Store {
  connected: boolean;
  mode: 'demo' | 'live';
  /** mode live dilindungi kata sandi aplikasi (env APP_PASSWORD) */
  locked: boolean;
  /** nama model yang dipakai di mode live */
  model: string | null;
  /** 'ws' = event datang dari server lewat WebSocket; 'lokal' = orkestrasi berjalan di browser ini */
  transport: 'ws' | 'lokal';
  /** jumlah browser yang tersambung ke server real-time */
  viewers: number;
  /** sedang menunggu server real-time terpisah bangun dari tidur */
  waking: boolean;
  session: SessionState | null;
  // UI
  filter: AgentId | 'semua';
  feedCollapsed: boolean;
  tab: TabId;
  fullOffice: boolean;
  /** null = otomatis mengikuti lebar layar */
  compactOverride: boolean | null;
  previewId: string | null;
  /** '3d' = Three.js, '2d' = kanvas isometrik (cadangan bila WebGL bermasalah) */
  sceneMode: '3d' | '2d';
  camera: { preset: CameraPreset; tick: number };
  /** tab yang punya isi baru dan belum dibuka */
  unseen: Partial<Record<TabId, number>>;

  apply: (ev: ServerEvent) => void;
  setConnected: (v: boolean) => void;
  setFilter: (f: AgentId | 'semua') => void;
  toggleFeed: () => void;
  setTab: (t: TabId) => void;
  toggleFullOffice: () => void;
  setCompact: (v: boolean | null) => void;
  setPreview: (id: string | null) => void;
  setSceneMode: (m: '3d' | '2d') => void;
  setCamera: (p: CameraPreset) => void;
}

const trim = <T,>(list: T[], n: number) => (list.length > n ? list.slice(list.length - n) : list);

export const useStore = create<Store>((set) => ({
  connected: false,
  mode: 'demo',
  locked: false,
  model: null,
  transport: 'lokal',
  viewers: 0,
  waking: false,
  session: null,
  filter: 'semua',
  feedCollapsed: false,
  tab: 'roadmap',
  fullOffice: false,
  compactOverride: null,
  previewId: null,
  sceneMode: '2d',
  camera: { preset: 'isometrik', tick: 0 },
  unseen: {},

  setConnected: (connected) => set({ connected }),
  setFilter: (filter) => set({ filter }),
  toggleFeed: () => set((s) => ({ feedCollapsed: !s.feedCollapsed })),
  setTab: (tab) => set((s) => ({ tab, unseen: { ...s.unseen, [tab]: 0 } })),
  toggleFullOffice: () => set((s) => ({ fullOffice: !s.fullOffice })),
  setCompact: (compactOverride) => set({ compactOverride }),
  setPreview: (previewId) => set({ previewId }),
  setSceneMode: (sceneMode) => set({ sceneMode }),
  setCamera: (preset) => set((s) => ({ camera: { preset, tick: s.camera.tick + 1 } })),

  apply: (ev) =>
    set((st) => {
      if (ev.type === 'snapshot') {
        const session = ev.payload.session
          ? { ...ev.payload.session, activities: trim(ev.payload.session.activities, FEED_LIMIT) }
          : null;
        const sameSession = session && st.session && session.id === st.session.id;
        return { session, mode: ev.payload.mode, unseen: sameSession ? st.unseen : {}, previewId: sameSession ? st.previewId : null };
      }
      const s = st.session;
      if (!s) return {};
      const bump = (tab: TabId) => (st.tab === tab ? st.unseen : { ...st.unseen, [tab]: (st.unseen[tab] ?? 0) + 1 });
      switch (ev.type) {
        case 'agent_status_changed':
          return { session: { ...s, agents: { ...s.agents, [ev.payload.id]: ev.payload } } };
        case 'activity_logged':
          return { session: { ...s, activities: trim([...s.activities, ev.payload], FEED_LIMIT) } };
        case 'task_assigned': {
          const exists = s.roadmap.some((t) => t.id === ev.payload.id);
          const roadmap = exists ? s.roadmap.map((t) => (t.id === ev.payload.id ? ev.payload : t)) : [...s.roadmap, ev.payload];
          return { session: { ...s, roadmap } };
        }
        case 'roadmap_progress_updated':
          return { session: { ...s, progress: ev.payload.progress, roadmap: ev.payload.roadmap } };
        case 'artifact_created': {
          const exists = s.artifacts.some((a) => a.id === ev.payload.id);
          const artifacts = exists ? s.artifacts.map((a) => (a.id === ev.payload.id ? ev.payload : a)) : [...s.artifacts, ev.payload];
          return { session: { ...s, artifacts }, unseen: bump('output') };
        }
        case 'decision_logged':
          return { session: { ...s, decisions: [...s.decisions, ev.payload] }, unseen: bump('keputusan') };
        case 'stats_updated':
          return { session: { ...s, stats: ev.payload } };
        case 'validation_updated':
          return { session: { ...s, validation: ev.payload }, unseen: bump('validasi') };
        case 'whiteboard_updated':
          return { session: { ...s, whiteboard: ev.payload } };
        case 'session_ended':
          return { session: { ...s, running: false, finishedAt: ev.payload.finishedAt } };
        default:
          return {};
      }
    }),
}));

// ---------- runtime ----------
// Dua jalur dengan event yang sama persis:
//   1. WebSocket  — orkestrasi berjalan di server real-time; event dikirim ke semua browser.
//   2. Lokal      — tanpa server real-time (mis. di Vercel), orkestrasi berjalan di browser ini.
let realtime: Realtime | null = null;
let current: Session | null = null;
let password = '';
try {
  password = sessionStorage.getItem('rkt:sandi') ?? '';
} catch {
  /* abaikan */
}
const demoEngine = new DemoEngine();
const liveEngine = new LiveEngine(createClaudeCaller(() => password));
const engineFor = (mode: 'demo' | 'live'): Engine => (mode === 'live' ? liveEngine : demoEngine);
const demoSpeed = Math.max(0.25, Number(import.meta.env.VITE_DEMO_SPEED ?? 1) || 1);

/**
 * Session mengubah state-nya di tempat. Event disalin dulu supaya store React
 * tidak berbagi referensi dengan state milik Session (di jalur WebSocket batas
 * ini sudah dijaga oleh serialisasi JSON).
 */
const emit = (ev: ServerEvent) => useStore.getState().apply(JSON.parse(JSON.stringify(ev)) as ServerEvent);

function drive(session: Session, job: Promise<void>) {
  const engine = engineFor(session.state.mode);
  (async () => {
    await job;
    // pesan yang masuk di detik-detik terakhir tetap diproses sebelum sesi ditutup
    while (session.inbox.length && !session.aborted) await engine.resume(session);
    session.finish(true);
  })().catch((err) => {
    if (err instanceof Aborted || session.aborted) return;
    console.error('[orkestrator]', err);
    session.log('sistem', 'sistem', `Terjadi galat: ${err?.message ?? err}`);
    session.finish(false);
  });
}

/** Dipanggil sekali saat aplikasi dimuat: sambungkan WebSocket; bila tidak ada, pakai mode lokal. */
let connecting: Promise<void> | null = null;
/** Aman dipanggil berkali-kali (React StrictMode menjalankan efek dua kali): hanya satu koneksi yang dibuat. */
export function connect(): Promise<void> {
  connecting ??= connectOnce();
  return connecting;
}

async function connectOnce() {
  const st = useStore.getState();

  useStore.setState({ waking: hasRemoteRealtime() });
  // 1) Coba server real-time. `hello` membawa mode/model, `snapshot` membawa state sesi.
  realtime = await openRealtime({
    onEvent: (ev) => {
      if (ev.type === 'hello') {
        useStore.setState({ mode: ev.payload.mode, model: ev.payload.model, locked: !!ev.payload.locked, viewers: ev.payload.viewers ?? 0 });
      } else if (ev.type === 'viewers') {
        useStore.setState({ viewers: Number(ev.payload) || 0 });
      } else if (ev.type === 'error') {
        console.warn('[realtime]', ev.payload?.message);
      } else {
        useStore.getState().apply(ev as ServerEvent);
      }
    },
    onStatus: (connected) => useStore.getState().setConnected(connected),
  });
  useStore.setState({ waking: false });
  if (realtime) {
    useStore.setState({ transport: 'ws' });
    return;
  }

  // 2) Mode lokal: cek mode di /api/health dan pulihkan sesi terakhir dari penyimpanan browser.
  let mode: 'demo' | 'live' = 'demo';
  let locked = false;
  let model: string | null = null;
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const h = await res.json();
      mode = h.mode === 'live' ? 'live' : 'demo';
      locked = !!h.locked;
      model = typeof h.model === 'string' ? h.model : null;
    }
  } catch {
    /* tanpa fungsi /api (mis. hosting statis murni) aplikasi berjalan dalam mode demo */
  }
  useStore.setState({ locked, model, transport: 'lokal' });
  if (!current) st.apply({ type: 'snapshot', payload: { session: loadLastSession(), mode } });
  else useStore.setState({ mode });
  st.setConnected(true);
}

export const api = {
  async start(brief: string) {
    if (realtime) return realtime.request({ type: 'start', brief, password });
    current?.abort();
    const mode = useStore.getState().mode;
    const session = new Session(brief, mode, browserStore, emit, mode === 'demo' ? demoSpeed : 1);
    current = session;
    emit({ type: 'snapshot', payload: { session: session.state, mode } });
    session.log('pengguna', 'pengguna', `Brief proyek: ${brief}`);
    drive(session, engineFor(mode).run(session));
  },
  async message(text: string) {
    if (realtime) return realtime.request({ type: 'message', text });
    const session = current;
    if (!session) throw new Error('Sesi ini sudah berakhir. Mulai sesi baru untuk mengirim pesan.');
    session.log('pengguna', 'pengguna', text);
    session.inbox.push(text);
    if (!session.state.running) {
      session.reopen();
      drive(session, engineFor(session.state.mode).resume(session));
    }
  },
  async stop() {
    if (realtime) return realtime.request({ type: 'stop' });
    const session = current;
    if (!session?.state.running) return;
    session.abort();
    session.log('sistem', 'sistem', 'Sesi dihentikan oleh pengguna.');
    session.finish(false);
  },
  setPassword(v: string) {
    password = v;
    try {
      sessionStorage.setItem('rkt:sandi', v);
    } catch {
      /* abaikan */
    }
  },
};
