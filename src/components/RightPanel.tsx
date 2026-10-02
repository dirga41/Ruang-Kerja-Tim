import { PHASES, type RoadmapTask } from '../shared/types';
import { useStore, type TabId } from '../store';
import { fmtTime } from '../lib/format';
import { DownloadButtons } from './ArtifactModal';
import { AgentTag, CheckPill, Empty, TaskPill } from './ui';

// referensi stabil supaya selector zustand tidak memicu render berulang
const NONE: never[] = [];

const TABS: { id: TabId; label: string }[] = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'keputusan', label: 'Keputusan' },
  { id: 'output', label: 'Output' },
  { id: 'validasi', label: 'Bukti Validasi' },
];

function Roadmap() {
  const roadmap = useStore((s) => s.session?.roadmap ?? NONE);
  if (!roadmap.length) return <Empty icon="🗺️" title="Roadmap belum dibuat">Azza menyusun roadmap begitu brief diterima.</Empty>;
  return (
    <ol className="space-y-3 p-3">
      {PHASES.map((ph, i) => {
        const tasks = roadmap.filter((t) => t.phase === ph.id);
        const done = tasks.filter((t) => t.status === 'selesai').length;
        const active = tasks.some((t) => t.status === 'berjalan' || t.status === 'revisi');
        const state = !tasks.length ? 'Belum ada tugas' : done === tasks.length ? 'Selesai' : active ? 'Berjalan' : done ? 'Sebagian' : 'Antre';
        return (
          <li key={ph.id} className="rounded-2xl border border-stone-200 bg-white/70">
            <div className="flex items-center gap-2 px-3 py-2">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  tasks.length && done === tasks.length ? 'bg-emerald-500 text-white' : active ? 'bg-sky-500 text-white' : 'bg-stone-200 text-stone-700'
                }`}
              >
                {tasks.length && done === tasks.length ? '✓' : i + 1}
              </span>
              <h3 className="flex-1 text-sm font-bold">{ph.label}</h3>
              <span className="text-[11px] font-semibold text-ink-mute">{state} · {done}/{tasks.length}</span>
            </div>
            {!!tasks.length && (
              <ul className="divide-y divide-stone-100 border-t border-stone-100">
                {tasks.map((t: RoadmapTask) => (
                  <li key={t.id} className="flex items-start gap-2 px-3 py-2">
                    <span className="mt-0.5 w-9 shrink-0 font-mono text-[10px] text-ink-mute">{t.id}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug">{t.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <AgentTag id={t.agent} />
                        <TaskPill status={t.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Decisions() {
  const decisions = useStore((s) => s.session?.decisions ?? NONE);
  if (!decisions.length) return <Empty icon="⚖️" title="Belum ada keputusan">Keputusan desain beserta alasannya dicatat di sini.</Empty>;
  return (
    <ul className="space-y-2 p-3">
      {[...decisions].reverse().map((d) => (
        <li key={d.id} className="rounded-2xl border border-stone-200 bg-white/70 p-3">
          <p className="text-[13px] font-bold leading-snug">{d.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">Alasan: </span>
            {d.reason}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <AgentTag id={d.agent} />
            <time className="font-mono text-[10px] text-ink-mute">{fmtTime(d.ts)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Outputs() {
  const artifacts = useStore((s) => s.session?.artifacts ?? NONE);
  const open = useStore((s) => s.setPreview);
  if (!artifacts.length) return <Empty icon="📂" title="Belum ada artefak">BRD, DFD, ERD, UML, wireframe, dan SRS muncul di sini.</Empty>;
  return (
    <ul className="space-y-2 p-3">
      {[...artifacts].sort((a, b) => b.ts - a.ts).map((a) => (
        <li key={a.id} className="rounded-2xl border border-stone-200 bg-white/70 p-3">
          <div className="flex items-start gap-2">
            <span className="pill mt-0.5 shrink-0 bg-stone-900 text-white">{a.type}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold leading-snug">{a.title}</p>
              <p className="mt-0.5 text-[10.5px] text-ink-mute">
                v{a.version} · {a.format === 'mermaid' ? 'Diagram' : 'Dokumen'} · {fmtTime(a.ts)}
              </p>
            </div>
            <AgentTag id={a.agent} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button className="btn-primary !py-1 !text-[11px]" onClick={() => open(a.id)}>Pratinjau</button>
            <DownloadButtons a={a} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Validation() {
  const v = useStore((s) => s.session?.validation);
  if (!v) return <Empty icon="🧪" title="Belum ada bukti validasi">Teratai mengisi matriks keterlacakan dan checklist QA setelah fase desain.</Empty>;
  const count = (st: string) => v.checklist.filter((c) => c.status === st).length;
  return (
    <div className="space-y-4 p-3">
      <div className="rounded-2xl border border-stone-200 bg-white/70 p-3">
        <p className="label">Putaran validasi {v.round} · {fmtTime(v.updatedAt)}</p>
        <p className="mt-1 text-xs text-ink-soft">
          <strong className="text-emerald-700">{count('lulus')} lulus</strong>,{' '}
          <strong className="text-rose-700">{count('gagal')} gagal</strong>,{' '}
          <strong className="text-amber-700">{count('perlu_tinjau')} perlu tinjauan</strong> dari {v.checklist.length} pemeriksaan.
        </p>
      </div>
      <div>
        <h3 className="label mb-1.5 px-1">Checklist QA</h3>
        <ul className="space-y-1.5">
          {v.checklist.map((c) => (
            <li key={c.id} className="rounded-xl border border-stone-200 bg-white/70 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-snug">
                  <span className="mr-1 font-mono text-[10px] text-ink-mute">{c.id}</span>
                  {c.item}
                </p>
                <CheckPill status={c.status} />
              </div>
              {c.note && <p className="mt-1 text-[11px] leading-snug text-ink-soft">{c.note}</p>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="label mb-1.5 px-1">Matriks keterlacakan</h3>
        <div className="thin-scroll overflow-x-auto rounded-xl border border-stone-200 bg-white/70">
          <table className="w-full min-w-[340px] text-left text-[11px]">
            <thead className="bg-stone-50 text-ink-soft">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Kebutuhan</th>
                <th className="px-2 py-1.5 font-semibold">Tertaut ke</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {v.matrix.map((r) => (
                <tr key={r.reqId} className="align-top">
                  <td className="px-2 py-1.5">
                    <span className="font-mono font-semibold">{r.reqId}</span>
                    <span className="block text-ink-soft">{r.requirement}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {r.links.map((l) => <span key={l} className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[10px]">{l}</span>)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5"><CheckPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function RightPanel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const unseen = useStore((s) => s.unseen);
  return (
    <section className="card flex h-full min-h-0 flex-col overflow-hidden" aria-label="Panel proyek">
      <div className="flex gap-1 border-b border-stone-200/70 p-1.5" role="tablist">
        {TABS.map((t) => {
          const on = tab === t.id;
          const n = unseen[t.id] ?? 0;
          return (
            <button
              key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
              className={`relative flex-1 whitespace-nowrap rounded-xl px-1.5 py-1.5 text-[11.5px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                on ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100'
              }`}
            >
              {t.label}
              {!on && n > 0 && (
                <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white" aria-label={`${n} baru`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'roadmap' && <Roadmap />}
        {tab === 'keputusan' && <Decisions />}
        {tab === 'output' && <Outputs />}
        {tab === 'validasi' && <Validation />}
      </div>
    </section>
  );
}
