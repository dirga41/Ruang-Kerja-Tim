/**
 * Adaptor untuk penyedia yang kompatibel dengan OpenAI Chat Completions
 * (OpenAI, OpenRouter, gateway pihak ketiga, dll.).
 *
 * Orkestrator memakai format pesan Anthropic. Modul ini mengubah permintaan
 * ke format OpenAI, lalu mengubah respons streaming OpenAI kembali menjadi
 * event bergaya Anthropic, sehingga kode di browser tidak perlu tahu penyedia
 * mana yang dipakai.
 */
interface AnyMsg { role: 'user' | 'assistant'; content: any }
interface AnyTool { name: string; description: string; input_schema: Record<string, any> }

export interface OpenAIRequestOptions {
  model: string; maxTokens: number; system: string; tools: AnyTool[]; messages: AnyMsg[];
  /** false = jangan kirim stream_options (sebagian penyedia menolaknya) */
  includeUsage?: boolean;
  /** true = instruksi sistem digabung ke pesan user pertama (untuk model tanpa peran `system`, mis. Gemma) */
  systemAsUser?: boolean;
}

export function toOpenAIRequest(opts: OpenAIRequestOptions) {
  const out: any[] = opts.systemAsUser ? [] : [{ role: 'system', content: opts.system }];
  for (const m of opts.messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const msg: any = { role: 'assistant', content: text || null };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
    } else {
      // hasil tool harus langsung mengikuti pesan assistant yang memanggilnya
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
          out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.is_error ? `GALAT: ${content}` : content });
        }
      }
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  if (opts.systemAsUser) {
    const first = out.find((m) => m.role === 'user');
    if (first) first.content = `[Instruksi sistem]\n${opts.system}\n\n[Pesan]\n${first.content}`;
    else out.unshift({ role: 'user', content: opts.system });
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: out,
    tools: opts.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    stream: true,
  };
  if (opts.includeUsage !== false) body.stream_options = { include_usage: true };
  return body;
}

/** Ubah stream SSE OpenAI menjadi stream SSE bergaya Anthropic. */
export function openAIStreamToAnthropic(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = upstream.getReader();
  let buf = '';
  let started = false;
  let textIndex = -1;
  let next = 0;
  const toolIndex = new Map<number, number>(); // indeks tool OpenAI → indeks blok
  const open = new Set<number>();
  let stop = 'end_turn';
  let usage = { input_tokens: 0, output_tokens: 0 };

  return new ReadableStream<Uint8Array>({
    // Satu loop sampai selesai: `pull` tidak dipanggil ulang bila sebuah bacaan tidak menghasilkan event.
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`));
      const start = () => {
        if (started) return;
        started = true;
        send('message_start', { message: { role: 'assistant', content: [], usage: { input_tokens: 0, output_tokens: 0 } } });
      };
      const handle = (chunk: any) => {
        if (chunk.error) throw new Error(chunk.error.message ?? 'galat dari penyedia');
        start();
        if (chunk.usage) usage = { input_tokens: chunk.usage.prompt_tokens ?? 0, output_tokens: chunk.usage.completion_tokens ?? 0 };
        const choice = chunk.choices?.[0];
        if (!choice) return;
        const d = choice.delta ?? {};
        if (typeof d.content === 'string' && d.content) {
          if (textIndex < 0) {
            textIndex = next++;
            open.add(textIndex);
            send('content_block_start', { index: textIndex, content_block: { type: 'text', text: '' } });
          }
          send('content_block_delta', { index: textIndex, delta: { type: 'text_delta', text: d.content } });
        }
        for (const tc of d.tool_calls ?? []) {
          const key = tc.index ?? 0;
          let idx = toolIndex.get(key);
          if (idx === undefined) {
            idx = next++;
            toolIndex.set(key, idx);
            open.add(idx);
            send('content_block_start', { index: idx, content_block: { type: 'tool_use', id: tc.id || `call_${Date.now()}_${key}`, name: tc.function?.name ?? '', input: {} } });
          }
          const args = tc.function?.arguments;
          if (args) send('content_block_delta', { index: idx, delta: { type: 'input_json_delta', partial_json: args } });
        }
        if (choice.finish_reason) stop = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
      };

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (value) buf += dec.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/);
          buf = done ? '' : (lines.pop() ?? '');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            handle(JSON.parse(payload));
          }
          if (done) break;
        }
        start();
        if (toolIndex.size) stop = 'tool_use';
        for (const i of open) send('content_block_stop', { index: i });
        send('message_delta', { delta: { stop_reason: stop }, usage });
        send('message_stop', {});
      } catch (err) {
        send('error', { error: { message: String((err as Error)?.message ?? err) } });
      }
      controller.close();
    },
    cancel() {
      void reader.cancel();
    },
  });
}
