export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const fmtNumber = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} jt` : n >= 10_000 ? `${(n / 1000).toFixed(1).replace('.', ',')} rb` : fmtNumber(n);

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (x: number) => String(x).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
