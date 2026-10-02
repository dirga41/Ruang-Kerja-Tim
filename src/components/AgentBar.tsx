import { AGENTS, AGENT_IDS, type AgentState } from '../shared/types';
import { useStore } from '../store';
import { fmtCompact } from '../lib/format';
import { AgentAvatar, StatusPill } from './ui';

const IDLE: Omit<AgentState, 'id'> = { status: 'istirahat', anim: 'istirahat', target: null, task: null, bubble: null, sessions: 0, tokens: 0, actions: 0 };

export function AgentBar({ columns = 6 }: { columns?: 2 | 3 | 6 }) {
  const agents = useStore((s) => s.session?.agents);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const grid = columns === 6 ? 'grid-cols-6' : columns === 3 ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <section className={`grid gap-2 ${grid}`} aria-label="Anggota tim">
      {AGENT_IDS.map((id) => {
        const def = AGENTS[id];
        const st = agents?.[id] ?? { id, ...IDLE };
        const on = filter === id;
        return (
          <button
            key={id}
            onClick={() => setFilter(on ? 'semua' : id)}
            aria-pressed={on}
            title={`Saring aktivitas ${def.name}`}
            className="card min-w-0 px-3 py-2.5 text-left transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            style={{ borderColor: on ? def.color : undefined, borderWidth: on ? 2 : undefined }}
          >
            <div className="flex items-center gap-2">
              <AgentAvatar id={id} size={34} ring={st.status === 'bekerja'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight" style={{ color: def.ink }}>{def.name}</p>
                <p className="truncate text-[10.5px] text-ink-mute">{def.role}</p>
              </div>
            </div>
            <div className="mt-1.5">
              <StatusPill status={st.status} />
            </div>
            <p className="mt-1 truncate text-[11px] text-ink-soft" title={st.task ?? undefined}>
              {st.task ?? 'Tidak ada tugas'}
            </p>
            <dl className="mt-1.5 flex justify-between gap-1 border-t border-stone-200/70 pt-1.5 text-[10.5px] text-ink-mute">
              <div><dt className="inline">Sesi </dt><dd className="inline font-bold tabular-nums text-ink">{st.sessions}</dd></div>
              <div><dt className="inline">Token </dt><dd className="inline font-bold tabular-nums text-ink">{fmtCompact(st.tokens)}</dd></div>
              <div><dt className="inline">Aksi </dt><dd className="inline font-bold tabular-nums text-ink">{st.actions}</dd></div>
            </dl>
          </button>
        );
      })}
    </section>
  );
}
