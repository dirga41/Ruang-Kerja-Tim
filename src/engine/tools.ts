import { AGENT_IDS, PHASES, type AgentId, type ArtifactType, type CheckStatus } from '../shared/types';

/**
 * Definisi tool tiap agent. Modul ini murni data, sehingga dipakai baik oleh
 * orkestrator di browser maupun fungsi /api/claude di server.
 */
export interface ToolDef { name: string; description: string; input_schema: Record<string, any> }

export const SPECIALISTS: AgentId[] = AGENT_IDS.filter((a) => a !== 'azza');
export const ARTIFACT_TYPES: ArtifactType[] = ['BRD', 'SRS', 'DFD', 'ERD', 'UML', 'Wireframe', 'Kamus Data', 'User Flow', 'Validasi', 'Ringkasan', 'Rencana', 'Lainnya'];
export const CHECK: CheckStatus[] = ['lulus', 'gagal', 'perlu_tinjau'];
export const MAX_TOKENS = 16000;

const T_SAVE: ToolDef = {
  name: 'save_artifact',
  description: 'Simpan artefak hasil kerja ke tab Output. Menyimpan dengan judul yang sama persis membuat versi baru dari artefak tersebut.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ARTIFACT_TYPES },
      title: { type: 'string', description: 'Judul artefak, mis. "DFD Level 1"' },
      format: { type: 'string', enum: ['markdown', 'mermaid'], description: '"mermaid" = kode diagram saja tanpa pagar; "markdown" = dokumen' },
      content: { type: 'string' },
      task_id: { type: 'string', description: 'Opsional: ID tugas roadmap yang selesai dengan artefak ini' },
    },
    required: ['type', 'title', 'format', 'content'],
  },
};

const T_DECISION: ToolDef = {
  name: 'log_decision',
  description: 'Catat keputusan desain penting beserta alasannya ke tab Keputusan.',
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string' }, reason: { type: 'string' } },
    required: ['title', 'reason'],
  },
};

const T_ROADMAP: ToolDef = {
  name: 'set_roadmap',
  description: 'Tambah atau perbarui tugas pada roadmap. Tugas dengan ID yang sudah ada diperbarui; ID baru ditambahkan.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'mis. T1' },
            phase: { type: 'string', enum: PHASES.map((p) => p.id) },
            title: { type: 'string' },
            agent: { type: 'string', enum: AGENT_IDS },
          },
          required: ['id', 'phase', 'title', 'agent'],
        },
      },
    },
    required: ['tasks'],
  },
};

const T_UPDATE_TASK: ToolDef = {
  name: 'update_task',
  description: 'Ubah status sebuah tugas roadmap (mis. menjadi "revisi" saat validasi menemukan celah).',
  input_schema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      status: { type: 'string', enum: ['antre', 'berjalan', 'selesai', 'revisi'] },
    },
    required: ['task_id', 'status'],
  },
};

const T_ASK: ToolDef = {
  name: 'ask_agent',
  description: 'Delegasikan tugas ke agent spesialis dan tunggu hasilnya. Beberapa ask_agent dalam satu giliran dijalankan paralel.',
  input_schema: {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: SPECIALISTS },
      task: { type: 'string', description: 'Instruksi tugas yang spesifik' },
      task_ids: { type: 'array', items: { type: 'string' }, description: 'ID tugas roadmap yang dikerjakan' },
    },
    required: ['agent', 'task'],
  },
};

const T_VALIDATION: ToolDef = {
  name: 'report_validation',
  description: 'Laporkan hasil validasi: checklist QA, matriks keterlacakan, dan daftar celah.',
  input_schema: {
    type: 'object',
    properties: {
      checklist: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'mis. QA-01' },
            item: { type: 'string' },
            status: { type: 'string', enum: CHECK },
            note: { type: 'string' },
          },
          required: ['id', 'item', 'status', 'note'],
        },
      },
      matrix: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            req_id: { type: 'string' },
            requirement: { type: 'string' },
            links: { type: 'array', items: { type: 'string' }, description: 'mis. "UC-01", "DFD P1.0", "ERD ANGGOTA", "W-02"' },
            status: { type: 'string', enum: CHECK },
          },
          required: ['req_id', 'requirement', 'links', 'status'],
        },
      },
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: { agent: { type: 'string', enum: SPECIALISTS }, issue: { type: 'string' } },
          required: ['agent', 'issue'],
        },
      },
    },
    required: ['checklist', 'matrix', 'gaps'],
  },
};

export const AZZA_TOOLS = [T_ROADMAP, T_ASK, T_UPDATE_TASK, T_DECISION, T_SAVE];
/** Tool yang boleh dipakai sebuah agent. */
export const toolsFor = (agent: AgentId): ToolDef[] => (agent === 'azza' ? AZZA_TOOLS : agent === 'teratai' ? [T_SAVE, T_DECISION, T_VALIDATION] : [T_SAVE, T_DECISION]);
