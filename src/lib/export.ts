import type { Artifact } from '../shared/types';
import { AGENTS } from '../shared/types';
import { firstMermaid, mermaidToCanvas, splitMermaid } from './mermaid';

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artefak';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toMarkdown(a: Artifact) {
  return a.format === 'mermaid' ? `# ${a.title}\n\n\`\`\`mermaid\n${a.content.trim()}\n\`\`\`\n` : a.content;
}

export function downloadMd(a: Artifact) {
  save(new Blob([toMarkdown(a)], { type: 'text/markdown;charset=utf-8' }), `${slug(a.title)}.md`);
}

export async function downloadPng(a: Artifact) {
  const code = firstMermaid(a);
  if (!code) throw new Error('Artefak ini tidak memuat diagram.');
  const canvas = await mermaidToCanvas(code, 2);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Gagal membuat PNG.');
  save(blob, `${slug(a.title)}.png`);
}

/** Font bawaan PDF hanya mendukung Latin-1; ganti simbol umum dan buang sisanya. */
function latin(t: string) {
  return t
    .replace(/[→⟶]/g, '->').replace(/←/g, '<-').replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/•/g, '-')
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');
}
const plain = (t: string) => latin(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1');

export async function downloadPdf(a: Artifact) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 48;
  const maxW = W - M * 2;
  let y = M;

  const need = (h: number) => {
    if (y + h > H - M) {
      pdf.addPage();
      y = M;
    }
  };
  const text = (t: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', font = 'helvetica', indent = 0) => {
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(t, maxW - indent) as string[];
    for (const line of lines) {
      need(size * 1.4);
      pdf.text(line, M + indent, y + size);
      y += size * 1.4;
    }
  };
  const table = (rows: string[][]) => {
    const cols = Math.max(...rows.map((r) => r.length));
    const colW = maxW / cols;
    const size = 8.5;
    rows.forEach((row, ri) => {
      pdf.setFont('helvetica', ri === 0 ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const cells = Array.from({ length: cols }, (_, i) => pdf.splitTextToSize(plain(row[i] ?? ''), colW - 8) as string[]);
      const h = Math.max(...cells.map((c) => c.length)) * size * 1.3 + 8;
      need(h);
      cells.forEach((lines, i) => {
        const x = M + i * colW;
        if (ri === 0) {
          pdf.setFillColor(245, 240, 230);
          pdf.rect(x, y, colW, h, 'F');
        }
        pdf.setDrawColor(200, 195, 185);
        pdf.rect(x, y, colW, h);
        pdf.text(lines, x + 4, y + 4 + size);
      });
      y += h;
    });
    y += 8;
  };
  const diagram = async (code: string) => {
    try {
      const canvas = await mermaidToCanvas(code, 2, 2400);
      const k = Math.min(maxW / canvas.width, (H - M * 2) / canvas.height, 0.6);
      const w = canvas.width * k;
      const h = canvas.height * k;
      need(h + 10);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', M + (maxW - w) / 2, y, w, h);
      y += h + 12;
    } catch {
      text(latin(code), 8, 'normal', 'courier');
    }
  };

  // kepala dokumen
  pdf.setTextColor(120, 110, 95);
  text(latin(`${a.type} - v${a.version} - oleh ${AGENTS[a.agent].name} - ${new Date(a.ts).toLocaleString('id-ID')}`), 8.5);
  pdf.setTextColor(30, 28, 25);
  y += 4;
  if (a.format === 'mermaid') {
    text(latin(a.title), 18, 'bold');
    y += 8;
    await diagram(a.content);
  } else {
    for (const part of splitMermaid(a.content)) {
      if (part.kind === 'mermaid') {
        await diagram(part.text);
        continue;
      }
      const lines = part.text.split('\n');
      let inCode = false;
      let tableRows: string[][] = [];
      const flushTable = () => {
        if (tableRows.length) table(tableRows);
        tableRows = [];
      };
      for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (line.startsWith('```')) {
          flushTable();
          inCode = !inCode;
          y += 4;
          continue;
        }
        if (inCode) {
          text(latin(line) || ' ', 7.5, 'normal', 'courier');
          continue;
        }
        if (/^\s*\|.*\|\s*$/.test(line)) {
          if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // baris pemisah
          tableRows.push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
          continue;
        }
        flushTable();
        if (!line.trim()) {
          y += 5;
        } else if (line.startsWith('# ')) {
          text(plain(line.slice(2)), 18, 'bold');
          y += 6;
        } else if (line.startsWith('## ')) {
          y += 8;
          text(plain(line.slice(3)), 13, 'bold');
          y += 3;
        } else if (/^#{3,}\s/.test(line)) {
          y += 5;
          text(plain(line.replace(/^#+\s/, '')), 11, 'bold');
        } else if (/^\s*[-*]\s/.test(line)) {
          text(`-  ${plain(line.replace(/^\s*[-*]\s/, ''))}`, 10, 'normal', 'helvetica', 10);
        } else if (/^\s*\d+\.\s/.test(line)) {
          text(plain(line.trim()), 10, 'normal', 'helvetica', 10);
        } else if (line.startsWith('>')) {
          text(plain(line.replace(/^>\s?/, '')), 10, 'italic', 'helvetica', 12);
        } else {
          text(plain(line), 10);
        }
      }
      flushTable();
    }
  }
  pdf.save(`${slug(a.title)}.pdf`);
}
