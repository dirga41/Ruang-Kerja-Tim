import { useEffect, useState } from 'react';
import type { Artifact } from '../shared/types';
import { useStore } from '../store';
import { downloadMd, downloadPdf, downloadPng } from '../lib/export';
import { firstMermaid } from '../lib/mermaid';
import { fmtTime } from '../lib/format';
import { MarkdownView, MermaidView } from './Markdown';
import { AgentTag } from './ui';

export function DownloadButtons({ a, size = 'sm' }: { a: Artifact; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasDiagram = !!firstMermaid(a);
  const run = (kind: string, fn: () => void | Promise<void>) => async () => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Unduhan gagal');
    } finally {
      setBusy(null);
    }
  };
  const cls = size === 'md' ? 'btn-ghost' : 'btn-ghost !px-2 !py-1 !text-[11px]';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button className={cls} onClick={run('md', () => downloadMd(a))} disabled={!!busy} aria-label={`Unduh ${a.title} sebagai Markdown`}>.md</button>
      <button className={cls} onClick={run('pdf', () => downloadPdf(a))} disabled={!!busy} aria-label={`Unduh ${a.title} sebagai PDF`}>
        {busy === 'pdf' ? '…' : '.pdf'}
      </button>
      <button
        className={cls} onClick={run('png', () => downloadPng(a))} disabled={!!busy || !hasDiagram}
        title={hasDiagram ? undefined : 'Hanya untuk artefak yang memuat diagram'} aria-label={`Unduh diagram ${a.title} sebagai PNG`}
      >
        {busy === 'png' ? '…' : '.png'}
      </button>
      {error && <span role="alert" className="text-[11px] font-semibold text-rose-700">{error}</span>}
    </span>
  );
}

export function ArtifactBody({ a }: { a: Artifact }) {
  return a.format === 'mermaid' ? <MermaidView code={a.content} /> : <MarkdownView content={a.content} />;
}

export function ArtifactModal() {
  const id = useStore((s) => s.previewId);
  const artifact = useStore((s) => s.session?.artifacts.find((x) => x.id === id) ?? null);
  const close = useStore((s) => s.setPreview);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!artifact) return;
    setShowSource(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artifact?.id, close]);

  if (!artifact) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-3 backdrop-blur-sm sm:p-8" onClick={() => close(null)}>
      <div
        role="dialog" aria-modal="true" aria-label={`Pratinjau ${artifact.title}`}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-5 py-3">
          <span className="pill bg-stone-900 text-white">{artifact.type}</span>
          <h2 className="min-w-0 flex-1 truncate text-base font-bold">{artifact.title}</h2>
          <AgentTag id={artifact.agent} />
          <span className="text-[11px] text-ink-mute">v{artifact.version} · {fmtTime(artifact.ts)}</span>
          <button className="btn-ghost" onClick={() => close(null)} aria-label="Tutup pratinjau">Tutup ✕</button>
        </header>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {showSource ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-stone-900 p-4 font-mono text-[11.5px] leading-snug text-stone-100">{artifact.content}</pre>
          ) : (
            <ArtifactBody a={artifact} />
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3">
          <button className="btn-ghost" onClick={() => setShowSource((v) => !v)} aria-pressed={showSource}>
            {showSource ? 'Lihat hasil render' : 'Lihat kode sumber'}
          </button>
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            Unduh: <DownloadButtons a={artifact} size="md" />
          </span>
        </footer>
      </div>
    </div>
  );
}
