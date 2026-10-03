import { useEffect, useState } from 'react';
import { AGENTS, AGENT_IDS, STATUS_LABEL } from '../shared/types';
import { useStore } from '../store';
import { fmtCompact, fmtDuration, fmtNumber } from '../lib/format';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function TitleCard() {
  const session = useStore((s) => s.session);
  const mode = useStore((s) => s.mode);
  const model = useStore((s) => s.model);
  const agents = session ? AGENT_IDS.map((id) => session.agents[id]) : [];
  const working = agents.filter((a) => a.status === 'bekerja');
  const lead = working[0];
  const sub = !session
    ? 'Belum ada sesi. Masukkan brief proyek untuk memulai.'
    : lead
      ? `${STATUS_LABEL.bekerja}: ${lead.task ?? lead.bubble ?? 'memproses'}`
      : session.running
        ? 'Tim sedang berkoordinasi'
        : 'Sesi selesai. Semua agent beristirahat.';
  return (
    <div className="card min-w-0 px-4 py-3">
      <div className="flex items-center gap-2">
        <h1 className="truncate text-base font-extrabold tracking-tight">
          Ruang Kerja Tim
          {lead && (
            <span style={{ color: AGENTS[lead.id].ink }}>
              {' · '}
              {AGENTS[lead.id].name}
              {working.length > 1 && <span className="font-semibold text-ink-mute"> +{working.length - 1}</span>}
            </span>
          )}
        </h1>
        <span title={mode === 'live' ? 'Model yang dipakai semua agent' : undefined} className={`pill max-w-[150px] shrink-0 truncate ${mode === 'live' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}`}>
          {mode === 'live' ? (model ?? 'API') : 'Mode demo'}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-soft" title={sub}>{sub}</p>
      {session && <p className="mt-0.5 truncate text-[11px] text-ink-mute" title={session.brief}>Brief: {session.brief}</p>}
    </div>
  );
}

export function LiveCard() {
  const session = useStore((s) => s.session);
  const connected = useStore((s) => s.connected);
  const transport = useStore((s) => s.transport);
  const viewers = useStore((s) => s.viewers);
  const waking = useStore((s) => s.waking);
  const running = !!session?.running;
  const now = useNow(running);
  const elapsed = session ? (session.finishedAt ?? now) - session.startedAt : 0;
  const progress = session?.progress ?? 0;
  const state = !connected ? (transport === 'ws' ? 'Terputus' : waking ? 'Membangunkan server…' : 'Menyiapkan') : running ? 'Live' : session ? 'Selesai' : 'Siap';
  const dot = !connected ? (transport === 'ws' ? 'bg-rose-500' : 'bg-stone-400') : running ? 'bg-emerald-500 pulse-dot' : 'bg-stone-400';
  return (
    <div className="card min-w-[220px] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          {state}
        </span>
        <span
          className={`pill ${transport === 'ws' ? 'bg-sky-100 text-sky-800' : 'bg-stone-100 text-stone-600'}`}
          title={transport === 'ws' ? 'Event dikirim dari server lewat WebSocket' : 'Tanpa server real-time: orkestrasi berjalan di browser ini'}
        >
          {transport === 'ws' ? `WebSocket · ${viewers} tersambung` : 'Lokal'}
        </span>
        <span className="font-mono text-sm tabular-nums text-ink-soft" aria-label="Durasi sesi">{fmtDuration(elapsed)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-ink-soft">
        <span>Progres roadmap</span>
        <span className="tabular-nums">{progress}%</span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200"
        role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progres roadmap"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function StatsCard({ showOfficeButton = true }: { showOfficeButton?: boolean }) {
  const stats = useStore((s) => s.session?.stats);
  const fullOffice = useStore((s) => s.fullOffice);
  const toggle = useStore((s) => s.toggleFullOffice);
  const items: [string, string, string][] = [
    ['Dokumen selesai', fmtNumber(stats?.documents ?? 0), '📄'],
    ['Aksi tim', fmtNumber(stats?.actions ?? 0), '⚡'],
    ['Token diproses', fmtCompact(stats?.tokens ?? 0), '🔤'],
    ['Sesi kerja', fmtNumber(stats?.sessions ?? 0), '🗂️'],
  ];
  return (
    <div className="card flex items-stretch gap-1 px-2 py-2">
      {items.map(([label, value, icon]) => (
        <div key={label} className="min-w-[78px] rounded-xl px-2.5 py-1">
          <p className="whitespace-nowrap text-[10.5px] font-semibold text-ink-mute">
            <span aria-hidden>{icon} </span>
            {label}
          </p>
          <p className="text-lg font-extrabold leading-tight tabular-nums">{value}</p>
        </div>
      ))}
      {showOfficeButton && (
        <button className="btn-primary ml-1 self-center whitespace-nowrap" onClick={toggle} aria-pressed={fullOffice}>
          {fullOffice ? 'Tampilkan panel' : 'Lihat kantor penuh'}
        </button>
      )}
    </div>
  );
}
