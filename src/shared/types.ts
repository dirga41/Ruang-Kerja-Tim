// Tipe bersama antara server dan web.

export type AgentId = 'azza' | 'anggrek' | 'melati' | 'mawar' | 'lavender' | 'teratai';

/** Status yang tampil di UI: Sedang bekerja / Istirahat / Menunggu */
export type AgentStatus = 'bekerja' | 'istirahat' | 'menunggu';

/** Animasi avatar di scene 3D */
export type AgentAnim = 'mengetik' | 'ke_papan' | 'berbicara' | 'istirahat' | 'menunggu';

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  emoji: string;
  /** warna aksen utama */
  color: string;
  /** latar pastel */
  soft: string;
  /** warna teks gelap yang kontras di atas `soft` */
  ink: string;
  hair: string;
  skin: string;
  hairStyle: 'pendek' | 'panjang' | 'sanggul' | 'hijab' | 'kuncir';
}

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  anim: AgentAnim;
  /** agent yang sedang diajak bicara (untuk anim `berbicara`) */
  target: AgentId | null;
  task: string | null;
  bubble: string | null;
  sessions: number;
  tokens: number;
  actions: number;
}

export type PhaseId = 'perencanaan' | 'analisis' | 'desain' | 'validasi' | 'dokumentasi';
export type TaskStatus = 'antre' | 'berjalan' | 'selesai' | 'revisi';

export interface RoadmapTask {
  id: string;
  phase: PhaseId;
  title: string;
  agent: AgentId;
  status: TaskStatus;
}

export type ActivityKind = 'tool_call' | 'tool_ok' | 'pesan' | 'sistem' | 'pengguna';

export interface Activity {
  id: string;
  ts: number;
  agent: AgentId | 'pengguna' | 'sistem';
  kind: ActivityKind;
  text: string;
}

export type ArtifactType =
  | 'BRD' | 'SRS' | 'DFD' | 'ERD' | 'UML' | 'Wireframe' | 'Kamus Data'
  | 'User Flow' | 'Validasi' | 'Ringkasan' | 'Rencana' | 'Lainnya';

export interface Artifact {
  id: string;
  ts: number;
  agent: AgentId;
  type: ArtifactType;
  title: string;
  /** `markdown` boleh memuat blok ```mermaid; `mermaid` berisi kode diagram murni */
  format: 'markdown' | 'mermaid';
  content: string;
  version: number;
}

export interface Decision {
  id: string;
  ts: number;
  agent: AgentId;
  title: string;
  reason: string;
}

export type CheckStatus = 'lulus' | 'gagal' | 'perlu_tinjau';

export interface ValidationCheck {
  id: string;
  item: string;
  status: CheckStatus;
  note: string;
}

export interface TraceRow {
  reqId: string;
  requirement: string;
  /** artefak / elemen yang menutup kebutuhan ini, mis. "UC-01", "DFD P1.0", "ERD ANGGOTA" */
  links: string[];
  status: CheckStatus;
}

export interface Validation {
  updatedAt: number;
  round: number;
  checklist: ValidationCheck[];
  matrix: TraceRow[];
}

export interface Stats {
  documents: number;
  actions: number;
  tokens: number;
  sessions: number;
}

export interface Whiteboard {
  title: string;
  code: string;
  agent: AgentId;
}

export interface SessionState {
  id: string;
  brief: string;
  mode: 'demo' | 'live';
  startedAt: number;
  finishedAt: number | null;
  running: boolean;
  progress: number;
  agents: Record<AgentId, AgentState>;
  roadmap: RoadmapTask[];
  activities: Activity[];
  artifacts: Artifact[];
  decisions: Decision[];
  validation: Validation | null;
  stats: Stats;
  whiteboard: Whiteboard | null;
}

export type ServerEvent =
  | { type: 'snapshot'; payload: { session: SessionState | null; mode: 'demo' | 'live' } }
  | { type: 'agent_status_changed'; payload: AgentState }
  | { type: 'activity_logged'; payload: Activity }
  | { type: 'task_assigned'; payload: RoadmapTask }
  | { type: 'artifact_created'; payload: Artifact }
  | { type: 'decision_logged'; payload: Decision }
  | { type: 'roadmap_progress_updated'; payload: { progress: number; roadmap: RoadmapTask[] } }
  | { type: 'stats_updated'; payload: Stats }
  | { type: 'validation_updated'; payload: Validation }
  | { type: 'whiteboard_updated'; payload: Whiteboard | null }
  | { type: 'session_ended'; payload: { finishedAt: number; ok: boolean } };

export const PHASES: { id: PhaseId; label: string }[] = [
  { id: 'perencanaan', label: 'Perencanaan' },
  { id: 'analisis', label: 'Analisis' },
  { id: 'desain', label: 'Desain' },
  { id: 'validasi', label: 'Validasi' },
  { id: 'dokumentasi', label: 'Dokumentasi' },
];

export const AGENT_IDS: AgentId[] = ['azza', 'anggrek', 'melati', 'mawar', 'lavender', 'teratai'];

export const AGENTS: Record<AgentId, AgentDef> = {
  azza: {
    id: 'azza', name: 'Azza', role: 'Orkestrator · Lead System Analyst', emoji: '✨',
    color: '#5B8DEF', soft: '#E4EDFF', ink: '#1F4AA8', hair: '#2B2B33', skin: '#E8B894', hairStyle: 'kuncir',
  },
  anggrek: {
    id: 'anggrek', name: 'Anggrek', role: 'Business Analyst', emoji: '🌸',
    color: '#E58FB1', soft: '#FDE8F0', ink: '#A03463', hair: '#3A2A22', skin: '#F2C9A8', hairStyle: 'panjang',
  },
  melati: {
    id: 'melati', name: 'Melati', role: 'Data & Process Modeler', emoji: '🌼',
    color: '#F2A154', soft: '#FDEEDC', ink: '#9A5206', hair: '#4A2F1E', skin: '#E3AE86', hairStyle: 'sanggul',
  },
  mawar: {
    id: 'mawar', name: 'Mawar', role: 'UI/UX Analyst', emoji: '🌹',
    color: '#E0647A', soft: '#FCE3E7', ink: '#A12840', hair: '#1F1B24', skin: '#F0C3A0', hairStyle: 'pendek',
  },
  lavender: {
    id: 'lavender', name: 'Lavender', role: 'System Designer', emoji: '🪻',
    color: '#9B7EDE', soft: '#EEE7FC', ink: '#5A3AA6', hair: '#2E2420', skin: '#D9A47C', hairStyle: 'panjang',
  },
  teratai: {
    id: 'teratai', name: 'Teratai', role: 'QA & Komunikasi', emoji: '🪷',
    color: '#4FB286', soft: '#DFF4E9', ink: '#1E6B48', hair: '#BFE5D0', skin: '#EBC09C', hairStyle: 'hijab',
  },
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  bekerja: 'Sedang bekerja',
  istirahat: 'Istirahat',
  menunggu: 'Menunggu',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  antre: 'Antre',
  berjalan: 'Berjalan',
  selesai: 'Selesai',
  revisi: 'Revisi',
};

export const SEED_BRIEF = 'Sistem Informasi Perpustakaan Kampus';
