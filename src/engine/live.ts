import {
  AGENTS, AGENT_IDS, PHASES,
  type AgentId, type ArtifactType, type CheckStatus, type PhaseId, type TaskStatus,
} from '../shared/types';
import { firstMermaid, type Engine, type Session } from './session';
import { ARTIFACT_TYPES, CHECK, SPECIALISTS } from './tools';

/**
 * Orkestrasi sungguhan lewat Anthropic Claude API dengan tool use.
 * Azza menjalankan loop utama; tool `ask_agent` menjalankan loop agent
 * spesialis (satu system prompt per agent) dan mengembalikan ringkasannya.
 *
 * Loop ini berjalan di browser. Setiap giliran model adalah satu panggilan ke
 * `/api/claude`; system prompt, daftar tool, dan API key hanya ada di server.
 */

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: string; [k: string]: any };
export type Msg = { role: 'user' | 'assistant'; content: any };
export interface ModelReply { content: Block[]; usage: { input_tokens?: number; output_tokens?: number }; stop_reason: string }
/** Satu giliran model untuk sebuah agent. */
export type CallModel = (agent: AgentId, messages: Msg[], signal: AbortSignal) => Promise<ModelReply>;
interface ToolResult { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

const MAX_AZZA_TURNS = 40;
const MAX_SPECIALIST_TURNS = 10;

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim();

interface RunCtx {
  history: Msg[];
  /** antrean per agent supaya satu agent tidak mengerjakan dua tugas sekaligus */
  locks: Map<AgentId, Promise<unknown>>;
  round: number;
}

export class LiveEngine implements Engine {
  private ctx = new WeakMap<Session, RunCtx>();

  constructor(private callModel: CallModel) {}

  async run(s: Session) {
    const ctx: RunCtx = { history: [], locks: new Map(), round: 0 };
    this.ctx.set(s, ctx);
    ctx.history.push({
      role: 'user',
      content: `Brief proyek dari pengguna:\n"""\n${s.state.brief}\n"""\n\nPimpin tim menyelesaikan seluruh siklus analisis sistem untuk brief ini.`,
    });
    await this.azzaLoop(s, ctx);
  }

  async resume(s: Session) {
    const ctx = this.ctx.get(s);
    if (!ctx) return;
    ctx.history.push({ role: 'user', content: this.drainInbox(s) });
    await this.azzaLoop(s, ctx);
  }

  private drainInbox(s: Session) {
    const msgs = s.inbox.splice(0).map((m) => `[Pesan pengguna] ${m}`);
    return msgs.join('\n');
  }

  private async call(s: Session, agent: AgentId, messages: Msg[]) {
    s.check();
    const t0 = Date.now();
    const resp = await this.callModel(agent, messages, s.signal);
    s.check();
    const usage = resp.usage ?? {};
    s.addTokens(agent, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));
    const blocks = (resp.content ?? []) as Block[];
    const texts = blocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text.trim()).filter(Boolean);
    const uses = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    return { blocks, texts, uses, ms: Date.now() - t0, stop: resp.stop_reason };
  }

  // ---------- loop Azza ----------
  private async azzaLoop(s: Session, ctx: RunCtx) {
    for (let turn = 0; turn < MAX_AZZA_TURNS; turn++) {
      s.startWork('azza', 'Mengoordinasikan tim', s.state.agents.azza.bubble ?? 'Menyusun langkah berikutnya');
      const r = await this.call(s, 'azza', ctx.history);
      ctx.history.push({ role: 'assistant', content: r.blocks });
      for (const t of r.texts) {
        s.log('azza', 'pesan', clip(oneLine(t), 260));
        s.say('azza', clip(oneLine(t), 90));
      }
      if (r.stop === 'max_tokens' && !r.uses.length) {
        ctx.history.push({ role: 'user', content: 'Keluaranmu terpotong. Lanjutkan, dan simpan dokumen panjang lewat save_artifact.' });
        continue;
      }
      if (!r.uses.length) {
        if (s.inbox.length) {
          ctx.history.push({ role: 'user', content: this.drainInbox(s) });
          continue;
        }
        break;
      }
      const results = await Promise.all(r.uses.map((u) => this.safeTool(s, u, () => this.azzaTool(s, ctx, u))));
      const content: any[] = [...results];
      if (s.inbox.length) content.push({ type: 'text', text: this.drainInbox(s) });
      ctx.history.push({ role: 'user', content });
    }
    // Tugas milik Azza dianggap selesai ketika loop berakhir normal.
    for (const t of s.state.roadmap) if (t.agent === 'azza' && t.status !== 'selesai') s.setTaskStatus(t.id, 'selesai');
  }

  private async safeTool(s: Session, u: { id: string; name: string }, fn: () => Promise<string>): Promise<ToolResult> {
    try {
      const content = await fn();
      return { type: 'tool_result', tool_use_id: u.id, content };
    } catch (err: any) {
      if (s.aborted) throw err;
      s.log('sistem', 'sistem', `Tool ${u.name} gagal: ${clip(String(err?.message ?? err), 160)}`);
      return { type: 'tool_result', tool_use_id: u.id, content: `Galat: ${err?.message ?? err}`, is_error: true };
    }
  }

  private async azzaTool(s: Session, ctx: RunCtx, u: { name: string; input: Record<string, any> }): Promise<string> {
    const t0 = Date.now();
    const ok = () => s.log('azza', 'tool_ok', `tool_ok · ${Date.now() - t0}ms`);
    switch (u.name) {
      case 'set_roadmap': {
        const tasks = Array.isArray(u.input.tasks) ? u.input.tasks : [];
        s.log('azza', 'tool_call', `set_roadmap ${JSON.stringify({ tugas: tasks.length })}`);
        for (const t of tasks) {
          if (!t?.id || !PHASES.some((p) => p.id === t.phase) || !AGENT_IDS.includes(t.agent)) continue;
          s.upsertTask({ id: String(t.id), phase: t.phase as PhaseId, title: String(t.title ?? ''), agent: t.agent as AgentId });
        }
        // tugas perencanaan milik Azza selesai begitu roadmap terbit
        for (const t of s.state.roadmap) if (t.agent === 'azza' && t.phase === 'perencanaan') s.setTaskStatus(t.id, 'selesai');
        ok();
        return `Roadmap diperbarui: ${s.state.roadmap.length} tugas.`;
      }
      case 'update_task': {
        s.log('azza', 'tool_call', `update_task ${JSON.stringify(u.input)}`);
        s.setTaskStatus(String(u.input.task_id), u.input.status as TaskStatus);
        ok();
        return 'Status tugas diperbarui.';
      }
      case 'log_decision':
      case 'save_artifact':
        return this.commonTool(s, 'azza', u);
      case 'ask_agent': {
        const agent = u.input.agent as AgentId;
        if (!SPECIALISTS.includes(agent)) throw new Error(`Agent tidak dikenal: ${u.input.agent}`);
        const task = String(u.input.task ?? '');
        const taskIds: string[] = Array.isArray(u.input.task_ids) ? u.input.task_ids.map(String) : [];
        s.log('azza', 'tool_call', `ask_agent ${JSON.stringify({ agent, task: clip(oneLine(task), 110) })}`);
        s.setAgent('azza', { status: 'bekerja', anim: 'berbicara', target: agent, bubble: clip(`${AGENTS[agent].name}, tolong: ${oneLine(task)}`, 90) });
        if (s.state.agents[agent].status === 'istirahat') s.setAgent(agent, { status: 'menunggu', anim: 'menunggu', bubble: 'Siap, saya kerjakan.' });
        await s.pause(2200);
        s.setAgent('azza', { status: 'menunggu', anim: 'menunggu', target: null, task: 'Menunggu hasil tim', bubble: 'Menunggu hasil tim' });

        // satu agent mengerjakan satu tugas dalam satu waktu
        const prev = ctx.locks.get(agent) ?? Promise.resolve();
        const job = prev.catch(() => undefined).then(() => this.specialist(s, ctx, agent, task, taskIds));
        ctx.locks.set(agent, job);
        const result = await job;
        ok();
        return result;
      }
      default:
        throw new Error(`Tool tidak dikenal: ${u.name}`);
    }
  }

  // ---------- tool bersama ----------
  private async commonTool(s: Session, agent: AgentId, u: { name: string; input: Record<string, any> }): Promise<string> {
    const t0 = Date.now();
    if (u.name === 'log_decision') {
      const title = String(u.input.title ?? '').trim();
      s.addDecision(agent, title, String(u.input.reason ?? '').trim());
      s.log(agent, 'tool_call', `log_decision ${JSON.stringify({ title: clip(title, 90) })}`);
      s.log(agent, 'tool_ok', `tool_ok · ${Date.now() - t0}ms`);
      return 'Keputusan dicatat.';
    }
    if (u.name === 'save_artifact') {
      const type = (ARTIFACT_TYPES.includes(u.input.type) ? u.input.type : 'Lainnya') as ArtifactType;
      const title = String(u.input.title ?? 'Tanpa judul').trim();
      let format: 'markdown' | 'mermaid' = u.input.format === 'mermaid' ? 'mermaid' : 'markdown';
      let content = String(u.input.content ?? '');
      if (!content.trim()) throw new Error('content kosong');
      if (format === 'mermaid') {
        // buang pagar kode bila model tetap menyertakannya
        content = content.replace(/^\s*```(?:mermaid)?\s*\n/, '').replace(/\n```\s*$/, '');
      }
      s.log(agent, 'tool_call', `save_artifact ${JSON.stringify({ type, title })}`);
      const hasDiagram = !!firstMermaid({ format, content });
      if (hasDiagram && agent !== 'azza') {
        const board = s.presentOnBoard(agent, `Menggambar ${title} di papan tulis`, 4200);
        await s.pause(1700);
        s.addArtifact({ agent, type, title, format, content });
        await board;
      } else {
        s.addArtifact({ agent, type, title, format, content });
      }
      if (u.input.task_id) s.setTaskStatus(String(u.input.task_id), 'selesai');
      s.log(agent, 'tool_ok', `tool_ok · ${Date.now() - t0}ms`);
      return `Artefak "${title}" tersimpan.`;
    }
    throw new Error(`Tool tidak dikenal: ${u.name}`);
  }

  // ---------- loop agent spesialis ----------
  private artifactDigest(s: Session) {
    if (!s.state.artifacts.length) return '(belum ada artefak)';
    let budget = 60000;
    const parts: string[] = [];
    for (const a of s.state.artifacts) {
      const body = clip(a.content, Math.min(9000, Math.max(1500, budget)));
      budget -= body.length;
      parts.push(`### [${a.type}] ${a.title} — oleh ${AGENTS[a.agent].name}, v${a.version}, format ${a.format}\n${body}`);
      if (budget <= 0) break;
    }
    return parts.join('\n\n');
  }

  private async specialist(s: Session, ctx: RunCtx, agent: AgentId, task: string, taskIds: string[]): Promise<string> {
    for (const id of taskIds) s.setTaskStatus(id, 'berjalan');
    s.startWork(agent, clip(oneLine(task), 120), clip(oneLine(task), 80));
    const saved: string[] = [];
    let gapsText = '';
    let final = '';
    const messages: Msg[] = [{
      role: 'user',
      content: `Brief proyek:\n"""\n${s.state.brief}\n"""\n\nArtefak tim sejauh ini:\n${this.artifactDigest(s)}\n\nTugas dari Azza (Orkestrator):\n${task}`,
    }];

    try {
      for (let turn = 0; turn < MAX_SPECIALIST_TURNS; turn++) {
        const r = await this.call(s, agent, messages);
        messages.push({ role: 'assistant', content: r.blocks });
        for (const t of r.texts) {
          s.log(agent, 'pesan', clip(oneLine(t), 220));
          s.say(agent, clip(oneLine(t), 80));
        }
        if (!r.uses.length) {
          if (r.stop === 'max_tokens') {
            messages.push({ role: 'user', content: 'Keluaranmu terpotong. Simpan hasil lewat save_artifact dalam bagian yang lebih ringkas.' });
            continue;
          }
          final = r.texts.join('\n');
          break;
        }
        const results: ToolResult[] = [];
        for (const u of r.uses) {
          results.push(await this.safeTool(s, u, async () => {
            if (u.name === 'report_validation' && agent === 'teratai') {
              ctx.round += 1;
              const norm = (x: any): CheckStatus => (CHECK.includes(x) ? x : 'perlu_tinjau');
              const checklist = (u.input.checklist ?? []).map((c: any, i: number) => ({
                id: String(c.id ?? `QA-${String(i + 1).padStart(2, '0')}`), item: String(c.item ?? ''), status: norm(c.status), note: String(c.note ?? ''),
              }));
              const matrix = (u.input.matrix ?? []).map((m: any) => ({
                reqId: String(m.req_id ?? ''), requirement: String(m.requirement ?? ''),
                links: Array.isArray(m.links) ? m.links.map(String) : [], status: norm(m.status),
              }));
              const gaps: { agent: string; issue: string }[] = Array.isArray(u.input.gaps) ? u.input.gaps : [];
              s.log(agent, 'tool_call', `report_validation ${JSON.stringify({ putaran: ctx.round, celah: gaps.length })}`);
              s.setValidation({ round: ctx.round, checklist, matrix });
              gapsText = gaps.length
                ? `Celah yang harus diperbaiki:\n${gaps.map((g) => `- (${g.agent}) ${g.issue}`).join('\n')}`
                : 'Tidak ada celah.';
              s.log(agent, 'tool_ok', 'tool_ok');
              return 'Hasil validasi tercatat di tab Bukti Validasi.';
            }
            const out = await this.commonTool(s, agent, u);
            if (u.name === 'save_artifact') saved.push(String(u.input.title));
            return out;
          }));
        }
        messages.push({ role: 'user', content: results });
      }
    } finally {
      if (!s.aborted) {
        for (const id of taskIds) s.setTaskStatus(id, 'selesai');
        s.rest(agent);
      }
    }

    // Azza menerima isi artefak (dipotong) supaya bisa menyusun paket SRS akhir.
    const bodies = [...new Set(saved)]
      .map((title) => s.state.artifacts.find((a) => a.title.toLowerCase() === title.toLowerCase()))
      .filter((a) => !!a)
      .map((a) => `--- ${a!.title} (v${a!.version}, ${a!.format}) ---\n${clip(a!.content, 6000)}`);
    return [
      `Hasil dari ${AGENTS[agent].name}:`,
      saved.length ? `Artefak tersimpan: ${[...new Set(saved)].map((t) => `"${t}"`).join(', ')}.` : 'Tidak ada artefak yang disimpan.',
      gapsText,
      final ? `Ringkasan: ${clip(final, 1500)}` : '',
      ...bodies,
    ].filter(Boolean).join('\n');
  }
}
