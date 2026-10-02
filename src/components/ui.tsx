import type { ReactNode } from 'react';
import { AGENTS, STATUS_LABEL, TASK_STATUS_LABEL, type AgentId, type AgentStatus, type CheckStatus, type TaskStatus } from '../shared/types';

export function AgentAvatar({ id, size = 32, ring = false }: { id: AgentId | 'pengguna' | 'sistem'; size?: number; ring?: boolean }) {
  const a = id === 'pengguna' || id === 'sistem' ? null : AGENTS[id];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size, height: size, fontSize: size * 0.5,
        background: a ? a.soft : id === 'pengguna' ? '#EDE7DB' : '#E8ECF0',
        boxShadow: ring && a ? `0 0 0 2px #fff, 0 0 0 4px ${a.color}` : undefined,
      }}
    >
      {a ? a.emoji : id === 'pengguna' ? '🧑' : '⚙️'}
    </span>
  );
}

export const agentName = (id: AgentId | 'pengguna' | 'sistem') => (id === 'pengguna' ? 'Anda' : id === 'sistem' ? 'Sistem' : AGENTS[id].name);

const STATUS_STYLE: Record<AgentStatus, { cls: string; icon: string }> = {
  bekerja: { cls: 'bg-emerald-100 text-emerald-800', icon: '●' },
  istirahat: { cls: 'bg-stone-100 text-stone-600', icon: '☕' },
  menunggu: { cls: 'bg-amber-100 text-amber-800', icon: '⏳' },
};

export function StatusPill({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`pill ${s.cls}`}>
      <span aria-hidden className={status === 'bekerja' ? 'pulse-dot text-[8px]' : 'text-[10px]'}>{s.icon}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const TASK_STYLE: Record<TaskStatus, { cls: string; icon: string }> = {
  antre: { cls: 'bg-stone-100 text-stone-600', icon: '○' },
  berjalan: { cls: 'bg-sky-100 text-sky-800', icon: '◐' },
  selesai: { cls: 'bg-emerald-100 text-emerald-800', icon: '✓' },
  revisi: { cls: 'bg-rose-100 text-rose-800', icon: '↺' },
};

export function TaskPill({ status }: { status: TaskStatus }) {
  const s = TASK_STYLE[status];
  return (
    <span className={`pill ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

const CHECK_STYLE: Record<CheckStatus, { cls: string; icon: string; label: string }> = {
  lulus: { cls: 'bg-emerald-100 text-emerald-800', icon: '✓', label: 'Lulus' },
  gagal: { cls: 'bg-rose-100 text-rose-800', icon: '✕', label: 'Gagal' },
  perlu_tinjau: { cls: 'bg-amber-100 text-amber-800', icon: '!', label: 'Perlu tinjauan' },
};

export function CheckPill({ status }: { status: CheckStatus }) {
  const s = CHECK_STYLE[status];
  return (
    <span className={`pill whitespace-nowrap ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function AgentTag({ id }: { id: AgentId }) {
  const a = AGENTS[id];
  return (
    <span className="pill" style={{ background: a.soft, color: a.ink }}>
      <span aria-hidden>{a.emoji}</span>
      {a.name}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <span aria-hidden className="text-3xl">{icon}</span>
      <p className="text-sm font-semibold">{title}</p>
      {children && <p className="max-w-[26ch] text-xs text-ink-mute">{children}</p>}
    </div>
  );
}
