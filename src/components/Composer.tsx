import { useState, type FormEvent } from 'react';
import { SEED_BRIEF } from '../shared/types';
import { api, useStore } from '../store';

const EXAMPLES = [SEED_BRIEF, 'Sistem informasi inventaris toko', 'Aplikasi pengajuan cuti karyawan'];

/** Kartu awal: pengguna memasukkan brief proyek. */
export function StartCard() {
  const [brief, setBrief] = useState(SEED_BRIEF);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = useStore((s) => s.mode);
  const connected = useStore((s) => s.connected);
  const locked = useStore((s) => s.locked);
  const waking = useStore((s) => s.waking);
  const [sandi, setSandi] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (locked) api.setPassword(sandi);
      await api.start(brief.trim());
    } catch (err: any) {
      setError(err?.message ?? 'Gagal memulai sesi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-xl p-5">
      <h2 className="text-lg font-extrabold">Mulai sesi analisis</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Tulis brief proyek. Azza memecahnya menjadi roadmap, lalu tim mengerjakan elisitasi, pemodelan, desain, validasi, dan dokumentasi.
      </p>
      <label htmlFor="brief" className="label mt-4 block">Brief proyek</label>
      <textarea
        id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={4000}
        className="mt-1 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
        placeholder="mis. Sistem informasi inventaris toko"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="pill border border-stone-200 bg-white text-ink-soft hover:bg-stone-50" onClick={() => setBrief(ex)}>
            {ex}
          </button>
        ))}
      </div>
      {locked && (
        <>
          <label htmlFor="sandi" className="label mt-3 block">Kata sandi aplikasi</label>
          <input
            id="sandi" type="password" value={sandi} onChange={(e) => setSandi(e.target.value)} autoComplete="off"
            className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-mute">
          {!connected
            ? (waking ? 'Membangunkan server real-time. Di hosting gratis ini bisa sampai satu menit…' : 'Menyiapkan…')
            : mode === 'demo'
              ? 'Mode demo: memakai data simulasi karena API key belum diisi.'
              : 'Mode live: terhubung ke API model.'}
        </p>
        <button className="btn-primary !px-4 !py-2 !text-sm" disabled={busy || !brief.trim() || !connected || (locked && !sandi)}>
          {busy ? 'Memulai…' : 'Mulai kerja tim'}
        </button>
      </div>
    </form>
  );
}

/** Bar chat: pengguna bisa menyela kapan saja. */
export function ChatBar() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const running = useStore((s) => !!s.session?.running);
  const brief = useStore((s) => s.session?.brief ?? '');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message ?? 'Permintaan gagal');
    } finally {
      setBusy(false);
    }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    void act(async () => {
      await api.message(t);
      setText('');
    });
  };

  return (
    <div className="card w-full p-2">
      <form onSubmit={send} className="flex items-center gap-2">
        <label htmlFor="chat" className="sr-only">Pesan untuk tim</label>
        <input
          id="chat" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
          placeholder={running ? 'Sela tim, mis. "tambahkan modul laporan"' : 'Minta tambahan, mis. "tambahkan modul laporan"'}
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <button className="btn-primary !py-2" disabled={busy || !text.trim()}>Kirim</button>
        {running ? (
          <button type="button" className="btn-ghost !py-2" disabled={busy} onClick={() => act(api.stop)}>Hentikan</button>
        ) : confirmNew ? (
          <>
            <button type="button" className="btn-ghost !py-2" disabled={busy} onClick={() => act(() => api.start(brief)).then(() => setConfirmNew(false))}>Ulangi brief</button>
            <button type="button" className="btn-ghost !py-2" onClick={() => useStore.setState({ session: null })}>Brief baru</button>
          </>
        ) : (
          <button type="button" className="btn-ghost !py-2" onClick={() => setConfirmNew(true)}>Sesi baru</button>
        )}
      </form>
      {error && <p role="alert" className="px-2 pt-1 text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
