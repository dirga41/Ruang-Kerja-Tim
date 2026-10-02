import { AGENTS, AGENT_IDS, type Activity } from '../shared/types';
import { useStore, FEED_LIMIT } from '../store';
import { fmtTime } from '../lib/format';
import { AgentAvatar, agentName, Empty } from './ui';

function Entry({ a }: { a: Activity }) {
  const isAgent = a.agent !== 'pengguna' && a.agent !== 'sistem';
  const ink = isAgent ? AGENTS[a.agent as keyof typeof AGENTS].ink : '#5F574D';
  // tool_call: "nama_tool {json}" → nama tool ditebalkan
  const sp = a.text.indexOf(' ');
  const tool = a.kind === 'tool_call' ? (sp > 0 ? a.text.slice(0, sp) : a.text) : null;
  const rest = tool && sp > 0 ? a.text.slice(sp + 1) : '';
  return (
    <li className="feed-in flex gap-2 px-3 py-2">
      <AgentAvatar id={a.agent} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold" style={{ color: ink }}>{agentName(a.agent)}</span>
          <time className="shrink-0 font-mono text-[10px] tabular-nums text-ink-mute">{fmtTime(a.ts)}</time>
        </div>
        {a.kind === 'tool_call' ? (
          <p className="mt-0.5 break-words rounded-lg bg-stone-100 px-2 py-1 font-mono text-[11px] leading-snug text-stone-800">
            <span className="font-semibold text-indigo-700">{tool}</span> {rest}
          </p>
        ) : a.kind === 'tool_ok' ? (
          <p className="mt-0.5 font-mono text-[11px] text-emerald-700">✓ {a.text}</p>
        ) : a.kind === 'pengguna' ? (
          <p className="mt-0.5 break-words rounded-lg bg-amber-50 px-2 py-1 text-xs text-ink">{a.text}</p>
        ) : (
          <p className={`mt-0.5 break-words text-xs ${a.kind === 'sistem' ? 'italic text-ink-mute' : 'text-ink-soft'}`}>{a.text}</p>
        )}
      </div>
    </li>
  );
}

export function ActivityFeed({ collapsible = true }: { collapsible?: boolean }) {
  const activities = useStore((s) => s.session?.activities);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const collapsed = useStore((s) => s.feedCollapsed) && collapsible;
  const toggle = useStore((s) => s.toggleFeed);

  const list = (activities ?? []).filter((a) => filter === 'semua' || a.agent === filter).slice(-FEED_LIMIT).reverse();

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${collapsed ? '' : 'h-full'}`} aria-label="Aktivitas langsung">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
          Aktivitas langsung
          <span className="font-mono text-[10px] font-medium text-ink-mute">{list.length}/{FEED_LIMIT}</span>
        </h2>
        {collapsible && (
          <button className="btn-ghost !px-2 !py-1" onClick={toggle} aria-expanded={!collapsed}>
            {collapsed ? 'Buka ▾' : 'Tutup ▴'}
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          <div className="flex flex-wrap gap-1 border-y border-stone-200/70 px-3 py-2" role="group" aria-label="Filter per agent">
            <button
              className={`pill border ${filter === 'semua' ? 'border-ink bg-ink text-white' : 'border-stone-200 bg-white text-ink-soft'}`}
              onClick={() => setFilter('semua')} aria-pressed={filter === 'semua'}
            >
              Semua
            </button>
            {AGENT_IDS.map((id) => {
              const a = AGENTS[id];
              const on = filter === id;
              return (
                <button
                  key={id} onClick={() => setFilter(on ? 'semua' : id)} aria-pressed={on}
                  className="pill border"
                  style={{ background: on ? a.color : a.soft, color: on ? '#fff' : a.ink, borderColor: on ? a.ink : 'transparent' }}
                >
                  <span aria-hidden>{a.emoji}</span>
                  {a.name}
                </button>
              );
            })}
          </div>
          <ul className="thin-scroll min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto" aria-live="polite">
            {list.map((a) => <Entry key={a.id} a={a} />)}
            {!list.length && (
              <li>
                <Empty icon="📡" title="Belum ada aktivitas">
                  {filter === 'semua' ? 'Aktivitas tim muncul di sini begitu sesi dimulai.' : 'Agent ini belum punya aktivitas.'}
                </Empty>
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
