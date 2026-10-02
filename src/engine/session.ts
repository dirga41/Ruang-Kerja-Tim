import {
  AGENT_IDS,
  type Activity, type ActivityKind, type AgentId, type AgentState, type Artifact, type ArtifactType,
  type Decision, type RoadmapTask, type ServerEvent, type SessionState, type TaskStatus, type Validation,
} from '../shared/types';
/** Antarmuka penyimpanan; implementasi penyimpanan browser ada di storage.ts. */
export interface SessionStore {
  saveSnapshot(s: SessionState): void;
  insertActivity(sessionId: string, a: Activity): void;
  insertArtifact(sessionId: string, a: Artifact): void;
  insertDecision(sessionId: string, d: Decision): void;
  upsertTask(sessionId: string, t: RoadmapTask): void;
}

export class Aborted extends Error {
  constructor() {
    super('Sesi dihentikan');
  }
}

const MAX_ACTIVITIES_IN_STATE = 60;
// `crypto` global tersedia di Node 22 dan di browser (dipakai pratinjau tanpa server)
const shortId = () => globalThis.crypto.randomUUID().slice(0, 8);

/** Ambil blok mermaid pertama dari sebuah artefak (untuk papan tulis). */
export function firstMermaid(a: Pick<Artifact, 'format' | 'content'>): string | null {
  if (a.format === 'mermaid') return a.content.trim();
  const m = a.content.match(/```mermaid\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

/**
 * Satu sesi kerja tim. Semua perubahan state lewat method di sini agar
 * selalu (1) tersimpan ke SQLite dan (2) dipancarkan sebagai event WebSocket.
 * Dipakai oleh mesin demo maupun orkestrasi Claude API.
 */
export class Session {
  state: SessionState;
  aborted = false;
  private ac = new AbortController();
  /** dibatalkan saat sesi dihentikan; dipakai untuk memutus panggilan model yang sedang berjalan */
  get signal() {
    return this.ac.signal;
  }
  /** pesan pengguna yang belum diproses orkestrator */
  inbox: string[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    brief: string,
    mode: 'demo' | 'live',
    private store: SessionStore,
    private broadcast: (ev: ServerEvent) => void,
    /** pengali kecepatan animasi/jeda */
    public speed = 1,
  ) {
    const agents = {} as Record<AgentId, AgentState>;
    for (const id of AGENT_IDS) {
      agents[id] = {
        id, status: 'istirahat', anim: 'istirahat', target: null, task: null, bubble: null,
        sessions: 0, tokens: 0, actions: 0,
      };
    }
    this.state = {
      id: shortId(), brief, mode, startedAt: Date.now(), finishedAt: null, running: true, progress: 0,
      agents, roadmap: [], activities: [], artifacts: [], decisions: [], validation: null,
      stats: { documents: 0, actions: 0, tokens: 0, sessions: 0 }, whiteboard: null,
    };
    this.persist(true);
  }

  // ---------- util ----------
  private emit(ev: ServerEvent) {
    this.broadcast(ev);
    this.persist();
  }

  private persist(now = false) {
    if (now) {
      this.store.saveSnapshot(this.state);
      return;
    }
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.store.saveSnapshot(this.state);
    }, 400);
  }

  check() {
    if (this.aborted) throw new Aborted();
  }

  /** Jeda yang menghormati kecepatan dan pembatalan sesi. */
  async pause(ms: number) {
    this.check();
    await new Promise((r) => setTimeout(r, ms / this.speed));
    this.check();
  }

  abort() {
    this.aborted = true;
    this.ac.abort();
    this.state.running = false;
    this.persist(true);
  }

  // ---------- agent ----------
  setAgent(id: AgentId, patch: Partial<AgentState>) {
    const a = this.state.agents[id];
    Object.assign(a, patch);
    this.emit({ type: 'agent_status_changed', payload: { ...a } });
  }

  /** Agent mulai mengerjakan tugas: status "Sedang bekerja", avatar mengetik. */
  startWork(id: AgentId, task: string, bubble?: string) {
    const a = this.state.agents[id];
    const isNewSession = a.status !== 'bekerja';
    if (isNewSession) {
      a.sessions += 1;
      this.state.stats.sessions += 1;
      this.emitStats();
    }
    this.setAgent(id, { status: 'bekerja', anim: 'mengetik', target: null, task, bubble: bubble ?? task });
  }

  /** Tidak ada tugas → otomatis istirahat. */
  rest(id: AgentId) {
    this.setAgent(id, { status: 'istirahat', anim: 'istirahat', target: null, task: null, bubble: null });
  }

  /** Menunggu hasil agent lain. */
  wait(id: AgentId, bubble: string) {
    this.setAgent(id, { status: 'menunggu', anim: 'menunggu', target: null, bubble });
  }

  say(id: AgentId, bubble: string) {
    this.setAgent(id, { bubble });
  }

  /** Avatar berjalan ke papan tulis, lalu kembali mengetik. */
  async presentOnBoard(id: AgentId, bubble: string, ms = 4200) {
    this.setAgent(id, { anim: 'ke_papan', bubble });
    await this.pause(ms);
    if (this.state.agents[id].status === 'bekerja') this.setAgent(id, { anim: 'mengetik' });
  }

  addTokens(id: AgentId, n: number) {
    if (!n) return;
    this.state.agents[id].tokens += n;
    this.state.stats.tokens += n;
    this.broadcast({ type: 'agent_status_changed', payload: { ...this.state.agents[id] } });
    this.emitStats();
  }

  private emitStats() {
    this.emit({ type: 'stats_updated', payload: { ...this.state.stats } });
  }

  // ---------- feed ----------
  log(agent: Activity['agent'], kind: ActivityKind, text: string) {
    const act: Activity = { id: shortId(), ts: Date.now(), agent, kind, text };
    this.state.activities.push(act);
    if (this.state.activities.length > MAX_ACTIVITIES_IN_STATE) {
      this.state.activities.splice(0, this.state.activities.length - MAX_ACTIVITIES_IN_STATE);
    }
    this.store.insertActivity(this.state.id, act);
    this.emit({ type: 'activity_logged', payload: act });
    if (agent !== 'pengguna' && agent !== 'sistem' && kind !== 'tool_ok') {
      this.state.agents[agent].actions += 1;
      this.state.stats.actions += 1;
      this.broadcast({ type: 'agent_status_changed', payload: { ...this.state.agents[agent] } });
      this.emitStats();
    }
    return act;
  }

  // ---------- roadmap ----------
  private emitProgress() {
    const total = this.state.roadmap.length;
    const done = this.state.roadmap.filter((t) => t.status === 'selesai').length;
    this.state.progress = total ? Math.round((done / total) * 100) : 0;
    this.emit({
      type: 'roadmap_progress_updated',
      payload: { progress: this.state.progress, roadmap: this.state.roadmap.map((t) => ({ ...t })) },
    });
  }

  upsertTask(task: Omit<RoadmapTask, 'status'> & { status?: TaskStatus }) {
    const existing = this.state.roadmap.find((t) => t.id === task.id);
    let t: RoadmapTask;
    if (existing) {
      Object.assign(existing, task);
      t = existing;
    } else {
      t = { status: 'antre', ...task };
      this.state.roadmap.push(t);
    }
    this.store.upsertTask(this.state.id, t);
    this.emit({ type: 'task_assigned', payload: { ...t } });
    this.emitProgress();
    return t;
  }

  setTaskStatus(id: string, status: TaskStatus) {
    const t = this.state.roadmap.find((x) => x.id === id);
    if (!t || t.status === status) return;
    t.status = status;
    this.store.upsertTask(this.state.id, t);
    this.emit({ type: 'task_assigned', payload: { ...t } });
    this.emitProgress();
  }

  // ---------- artefak, keputusan, validasi ----------
  addArtifact(input: { agent: AgentId; type: ArtifactType; title: string; format: 'markdown' | 'mermaid'; content: string }) {
    const prev = this.state.artifacts.find((a) => a.title.toLowerCase() === input.title.toLowerCase());
    let art: Artifact;
    if (prev) {
      Object.assign(prev, input, { ts: Date.now(), version: prev.version + 1 });
      art = prev;
    } else {
      art = { id: shortId(), ts: Date.now(), version: 1, ...input };
      this.state.artifacts.push(art);
      this.state.stats.documents += 1;
    }
    this.store.insertArtifact(this.state.id, art);
    this.emit({ type: 'artifact_created', payload: { ...art } });
    this.emitStats();
    const code = firstMermaid(art);
    if (code) {
      this.state.whiteboard = { title: art.title, code, agent: art.agent };
      this.emit({ type: 'whiteboard_updated', payload: this.state.whiteboard });
    }
    return art;
  }

  addDecision(agent: AgentId, title: string, reason: string) {
    const d: Decision = { id: shortId(), ts: Date.now(), agent, title, reason };
    this.state.decisions.push(d);
    this.store.insertDecision(this.state.id, d);
    this.emit({ type: 'decision_logged', payload: d });
    return d;
  }

  setValidation(v: Omit<Validation, 'updatedAt'>) {
    this.state.validation = { ...v, updatedAt: Date.now() };
    this.emit({ type: 'validation_updated', payload: this.state.validation });
  }

  // ---------- akhir sesi ----------
  finish(ok: boolean) {
    for (const id of AGENT_IDS) {
      const a = this.state.agents[id];
      if (a.status !== 'istirahat') this.rest(id);
    }
    this.state.running = false;
    this.state.finishedAt = Date.now();
    this.broadcast({ type: 'session_ended', payload: { finishedAt: this.state.finishedAt, ok } });
    this.persist(true);
  }

  /** Sesi dibuka lagi karena pengguna menyela setelah selesai. */
  reopen() {
    this.state.running = true;
    this.state.finishedAt = null;
    this.broadcast({ type: 'snapshot', payload: { session: this.state, mode: this.state.mode } });
  }
}

export interface Engine {
  /** Jalankan seluruh siklus analisis untuk sesi ini. */
  run(session: Session): Promise<void>;
  /** Lanjutkan sesi yang sudah selesai karena ada pesan baru di inbox. */
  resume(session: Session): Promise<void>;
}
