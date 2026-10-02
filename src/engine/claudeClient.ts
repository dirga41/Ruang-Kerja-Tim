import type { AgentId } from '../shared/types';
import type { Block, ModelReply, Msg } from './live';

/**
 * Klien untuk /api/claude: mengirim satu giliran model dan merakit ulang
 * respons streaming (Server-Sent Events) menjadi satu pesan utuh.
 */

const RETRYABLE = new Set([408, 429, 500, 502, 504, 529]);
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Dibatalkan', 'AbortError'));
    }, { once: true });
  });

/** Rakit event SSE Anthropic menjadi { content, usage, stop_reason }. */
export async function readMessageStream(stream: ReadableStream<Uint8Array>): Promise<ModelReply> {
  const blocks: Block[] = [];
  const jsonBuf: Record<number, string> = {};
  const usage = { input_tokens: 0, output_tokens: 0 };
  let stop = 'end_turn';
  let done = false;

  const handle = (data: any) => {
    switch (data.type) {
      case 'message_start': {
        const u = data.message?.usage ?? {};
        usage.input_tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        usage.output_tokens = u.output_tokens ?? 0;
        break;
      }
      case 'content_block_start':
        blocks[data.index] = { ...data.content_block };
        if (data.content_block?.type === 'tool_use') jsonBuf[data.index] = '';
        break;
      case 'content_block_delta': {
        const b = blocks[data.index] as any;
        if (!b) break;
        if (data.delta?.type === 'text_delta') b.text = (b.text ?? '') + data.delta.text;
        else if (data.delta?.type === 'input_json_delta') jsonBuf[data.index] += data.delta.partial_json ?? '';
        break;
      }
      case 'content_block_stop': {
        const b = blocks[data.index] as any;
        if (b?.type === 'tool_use') {
          try {
            b.input = jsonBuf[data.index] ? JSON.parse(jsonBuf[data.index]) : {};
          } catch {
            // JSON terpotong (mis. kena max_tokens): tandai agar orkestrator bisa meminta ulang
            b.input = { __invalid_json: true };
          }
        }
        break;
      }
      case 'message_delta':
        if (data.delta?.stop_reason) stop = data.delta.stop_reason;
        if (data.usage?.output_tokens != null) usage.output_tokens = data.usage.output_tokens;
        break;
      case 'message_stop':
        done = true;
        break;
      case 'error':
        throw new Error(`Penyedia model: ${data.error?.message ?? 'galat saat streaming'}`);
      default:
        break; // ping dan event lain diabaikan
    }
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const flush = (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      handle(JSON.parse(payload));
    }
  };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      flush(chunk);
    }
    if (end) break;
  }
  if (buf.trim()) flush(buf);
  if (!done && !blocks.length) throw new Error('Respons model terputus sebelum selesai.');
  return { content: blocks.filter(Boolean), usage, stop_reason: stop };
}

export function createClaudeCaller(getPassword: () => string) {
  return async function callClaude(agent: AgentId, messages: Msg[], signal: AbortSignal): Promise<ModelReply> {
    let lastError = 'Permintaan gagal';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(1500 * 2 ** (attempt - 1), signal);
      let res: Response;
      try {
        res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-app-password': getPassword() },
          body: JSON.stringify({ agent, messages }),
          signal,
        });
      } catch (err: any) {
        if (signal.aborted) throw err;
        lastError = 'Tidak bisa menghubungi server.';
        continue;
      }
      if (res.ok && res.body) return readMessageStream(res.body);
      const data = await res.json().catch(() => ({}));
      lastError = data.error ?? `Permintaan gagal (${res.status})`;
      if (!RETRYABLE.has(res.status)) break;
    }
    throw new Error(lastError);
  };
}
