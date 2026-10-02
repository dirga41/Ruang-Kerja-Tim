import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { renderMermaid, splitMermaid } from '../lib/mermaid';

export function MermaidView({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setSvg(null);
    setError(null);
    renderMermaid(code)
      .then((s) => !off && setSvg(s))
      .catch((e) => !off && setError(String(e?.message ?? e)));
    return () => {
      off = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
        <p className="text-xs font-semibold text-rose-800">Diagram tidak bisa dirender. Kode sumbernya:</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre text-[11px] text-rose-900">{code}</pre>
      </div>
    );
  }
  if (!svg) return <div className="my-3 h-40 animate-pulse rounded-xl bg-stone-100" aria-label="Merender diagram" />;
  return <div className="mermaid-box my-3 flex justify-center overflow-x-auto rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MdChunk({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false, gfm: true }) as string;
    // tabel lebar bisa digulir sendiri
    return DOMPurify.sanitize(raw).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  }, [text]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Dokumen markdown dengan blok ```mermaid yang dirender sebagai diagram. */
export function MarkdownView({ content }: { content: string }) {
  const parts = useMemo(() => splitMermaid(content), [content]);
  return (
    <div className="doc">
      {parts.map((p, i) => (p.kind === 'mermaid' ? <MermaidView key={i} code={p.text} /> : <MdChunk key={i} text={p.text} />))}
    </div>
  );
}
