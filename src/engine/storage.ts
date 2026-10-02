import type { SessionState } from '../shared/types';
import type { SessionStore } from './session';

/**
 * Penyimpanan di browser (localStorage): snapshot sesi terakhir dan riwayat
 * ringkas. Di Vercel tidak ada server yang hidup terus, jadi sesi disimpan
 * per browser. Semua akses dibungkus try/catch karena storage bisa diblokir.
 */
const LAST = 'rkt:sesi-terakhir';
const HISTORY = 'rkt:riwayat';

export interface HistoryRow { id: string; brief: string; mode: 'demo' | 'live'; startedAt: number; finishedAt: number | null; progress: number }

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* kuota penuh atau storage diblokir: aplikasi tetap jalan tanpa persistensi */
  }
};

export const browserStore: SessionStore = {
  saveSnapshot(s: SessionState) {
    write(LAST, s);
    const rows = read<HistoryRow[]>(HISTORY, []).filter((r) => r.id !== s.id);
    rows.unshift({ id: s.id, brief: s.brief, mode: s.mode, startedAt: s.startedAt, finishedAt: s.finishedAt, progress: s.progress });
    write(HISTORY, rows.slice(0, 30));
  },
  insertActivity() {},
  insertArtifact() {},
  insertDecision() {},
  upsertTask() {},
};

/** Sesi terakhir ditampilkan lagi setelah halaman dimuat ulang (tidak dilanjutkan). */
export function loadLastSession(): SessionState | null {
  const s = read<SessionState | null>(LAST, null);
  if (!s || !s.agents || !s.id) return null;
  s.running = false;
  s.finishedAt ??= Date.now();
  for (const a of Object.values(s.agents)) Object.assign(a, { status: 'istirahat', anim: 'istirahat', target: null, task: null, bubble: null });
  return s;
}

export const loadHistory = () => read<HistoryRow[]>(HISTORY, []);
