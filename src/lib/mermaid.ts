/**
 * Pembungkus Mermaid: dimuat malas (lazy), render diantrekan satu per satu,
 * dan label non-HTML supaya SVG bisa digambar ke canvas (papan tulis 3D, unduh PNG).
 */
type MermaidApi = typeof import('mermaid')['default'];

let loader: Promise<MermaidApi> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;

function load() {
  loader ??= import('mermaid').then((m) => {
    m.default.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      fontFamily: 'Arial, Helvetica, sans-serif',
      htmlLabels: false,
      flowchart: { htmlLabels: false, curve: 'basis' },
      suppressErrorRendering: true,
    } as any);
    return m.default;
  });
  return loader;
}

export function renderMermaid(code: string): Promise<string> {
  const job = queue.then(async () => {
    const mermaid = await load();
    const id = `mmd-${++seq}`;
    try {
      const { svg } = await mermaid.render(id, code);
      return svg;
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Pisahkan dokumen markdown menjadi potongan teks dan blok mermaid. */
export function splitMermaid(md: string): { kind: 'md' | 'mermaid'; text: string }[] {
  const out: { kind: 'md' | 'mermaid'; text: string }[] = [];
  const re = /```mermaid\s*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push({ kind: 'md', text: md.slice(last, m.index) });
    out.push({ kind: 'mermaid', text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push({ kind: 'md', text: md.slice(last) });
  return out;
}

export function firstMermaid(a: { format: string; content: string }): string | null {
  if (a.format === 'mermaid') return a.content.trim();
  return splitMermaid(a.content).find((p) => p.kind === 'mermaid')?.text ?? null;
}

/** Muat SVG sebagai gambar berukuran eksplisit (diambil dari viewBox). */
export function svgToImage(svg: string): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement;
  const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const width = Math.max(1, vb[2] || parseFloat(el.getAttribute('width') ?? '') || 800);
  const height = Math.max(1, vb[3] || parseFloat(el.getAttribute('height') ?? '') || 600);
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.removeAttribute('style');
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, width, height });
    img.onerror = () => reject(new Error('SVG tidak bisa dimuat sebagai gambar'));
    img.src = src;
  });
}

export async function mermaidToCanvas(code: string, scale = 2, maxSide = 4000): Promise<HTMLCanvasElement> {
  const { img, width, height } = await svgToImage(await renderMermaid(code));
  const k = Math.min(scale, maxSide / Math.max(width, height));
  const pad = 24;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * k + pad * 2);
  canvas.height = Math.round(height * k + pad * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, width * k, height * k);
  return canvas;
}
