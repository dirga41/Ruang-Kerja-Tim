import { resolveProvider } from '../src/engine/provider';

/** Memberi tahu klien apakah mode live tersedia dan model apa yang dipakai. Tidak pernah mengembalikan API key. */
export const config = { runtime: 'edge' };

export default function handler(): Response {
  const provider = resolveProvider(process.env);
  return new Response(
    JSON.stringify({
      ok: true,
      mode: provider ? 'live' : 'demo',
      provider: provider?.kind ?? null,
      model: provider?.model ?? null,
      locked: !!provider && !!process.env.APP_PASSWORD,
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
