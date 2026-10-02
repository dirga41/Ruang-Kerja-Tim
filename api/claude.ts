import { AGENT_IDS, type AgentId } from '../src/shared/types';
import { SYSTEM } from '../src/engine/prompts';
import { MAX_TOKENS, toolsFor } from '../src/engine/tools';
import { resolveProvider } from '../src/engine/provider';
import { openAIStreamToAnthropic, toOpenAIRequest } from '../src/engine/openaiAdapter';

/**
 * Proxy satu giliran model ke penyedia LLM (streaming): Anthropic Messages API,
 * atau penyedia apa pun yang kompatibel dengan OpenAI Chat Completions.
 * - API key hanya ada di server (env ANTHROPIC_API_KEY atau OPENAI_API_KEY).
 * - Klien hanya mengirim nama agent dan riwayat pesan; system prompt, tool,
 *   model, dan max_tokens ditentukan di sini, jadi endpoint ini tidak bisa
 *   dipakai sebagai proxy Claude serbaguna.
 * - Edge runtime: respons di-stream sehingga tidak terkena batas durasi
 *   fungsi serverless biasa.
 */
export const config = { runtime: 'edge' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Gunakan POST.' });

  const provider = resolveProvider(process.env);
  if (!provider) return json(503, { error: 'Mode live belum aktif: API key belum diisi di server.' });

  const password = process.env.APP_PASSWORD ?? '';
  if (password && req.headers.get('x-app-password') !== password) return json(401, { error: 'Kata sandi aplikasi salah.' });

  let body: { agent?: string; messages?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2_000_000) return json(413, { error: 'Riwayat percakapan terlalu besar.' });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Body bukan JSON yang valid.' });
  }
  const agent = body.agent as AgentId;
  if (!AGENT_IDS.includes(agent)) return json(400, { error: 'Agent tidak dikenal.' });
  if (!Array.isArray(body.messages) || !body.messages.length) return json(400, { error: 'messages wajib diisi.' });

  const messages = body.messages as any[];
  let upstream: Response;
  try {
    upstream = provider.kind === 'openai'
      ? await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
          body: JSON.stringify(toOpenAIRequest({ model: provider.model, maxTokens: MAX_TOKENS, system: SYSTEM[agent], tools: toolsFor(agent), messages })),
        })
      : await fetch(`${provider.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: provider.model, max_tokens: MAX_TOKENS, system: SYSTEM[agent], tools: toolsFor(agent), messages, stream: true }),
        });
  } catch (err) {
    return json(502, { error: `Tidak bisa menghubungi penyedia model (${provider.baseUrl}): ${String((err as Error)?.message ?? err)}` });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      message = parsed.error?.message ?? (typeof parsed.error === 'string' ? parsed.error : parsed.message) ?? message;
    } catch {
      /* biarkan teks apa adanya */
    }
    return json(upstream.status || 502, { error: `Penyedia model (${provider.model}): ${message || 'permintaan gagal'}` });
  }
  return new Response(provider.kind === 'openai' ? openAIStreamToAnthropic(upstream.body) : upstream.body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform' },
  });
}
