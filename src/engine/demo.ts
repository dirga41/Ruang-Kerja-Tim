import { AGENTS, type AgentId, type ArtifactType, type PhaseId } from '../shared/types';
import type { Engine, Session } from './session';
import { buildContent, profileFor, type DemoContent, type Profile } from './demo-content';

/**
 * Mesin simulasi: memutar siklus analisis lengkap dengan data contoh,
 * memancarkan event yang sama persis dengan mode Claude API.
 */

const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));

interface Ctx {
  s: Session;
  p: Profile;
  c: DemoContent;
  addenda: string[];
}

const ctxBySession = new WeakMap<Session, Ctx>();

/** Azza menghampiri agent tujuan dan memanggil tool `ask_agent`. */
async function delegate(s: Session, to: AgentId, taskIds: string[], task: string) {
  for (const id of taskIds) s.setTaskStatus(id, 'berjalan');
  s.setAgent('azza', { status: 'bekerja', anim: 'berbicara', target: to, bubble: `${AGENTS[to].name}, tolong: ${task}` });
  s.log('azza', 'tool_call', `ask_agent ${JSON.stringify({ agent: to, task })}`);
  s.addTokens('azza', rand(180, 420));
  s.setAgent(to, { status: 'menunggu', anim: 'menunggu', bubble: 'Siap, saya kerjakan.' });
  await s.pause(2600);
  s.log('azza', 'tool_ok', `tool_ok · ${rand(120, 480)}ms`);
  s.startWork(to, task);
}

/** Agent mengerjakan serangkaian langkah; tiap langkah muncul di bubble dan feed. */
async function steps(s: Session, agent: AgentId, list: string[]) {
  for (const text of list) {
    s.say(agent, text);
    s.log(agent, 'pesan', text);
    s.addTokens(agent, rand(450, 1400));
    await s.pause(rand(1700, 2600));
  }
}

async function produce(
  s: Session, agent: AgentId,
  art: { type: ArtifactType; title: string; format: 'markdown' | 'mermaid'; content: string },
  opts: { board?: boolean } = {},
) {
  if (opts.board ?? art.format === 'mermaid') {
    const board = s.presentOnBoard(agent, `Menggambar ${art.title} di papan tulis`, 4600);
    await s.pause(1900);
    s.addArtifact({ agent, ...art });
    s.log(agent, 'tool_call', `save_artifact ${JSON.stringify({ type: art.type, title: art.title })}`);
    await board;
  } else {
    s.addArtifact({ agent, ...art });
    s.log(agent, 'tool_call', `save_artifact ${JSON.stringify({ type: art.type, title: art.title })}`);
    await s.pause(500);
  }
  s.log(agent, 'tool_ok', `tool_ok · ${rand(40, 260)}ms`);
  s.addTokens(agent, rand(900, 2600));
}

function done(s: Session, agent: AgentId, taskIds: string[]) {
  for (const id of taskIds) s.setTaskStatus(id, 'selesai');
  s.rest(agent);
}

function decide(s: Session, agent: AgentId, title: string, reason: string) {
  s.addDecision(agent, title, reason);
  s.log(agent, 'tool_call', `log_decision ${JSON.stringify({ title })}`);
}

function azzaBack(s: Session, bubble: string) {
  s.setAgent('azza', { status: 'menunggu', anim: 'menunggu', target: null, task: bubble, bubble });
}

// ---------- pekerjaan tiap agent ----------

async function anggrekWork({ s, p, c }: Ctx) {
  await steps(s, 'anggrek', ['Mengidentifikasi stakeholder dan kepentingannya', `Mewawancarai ${p.petugas.toLowerCase()} (simulasi elisitasi)`]);
  await produce(s, 'anggrek', { type: 'BRD', title: 'Peta Stakeholder', format: 'mermaid', content: c.stakeholder });
  s.setTaskStatus('T2', 'selesai');
  await steps(s, 'anggrek', ['Menyusun user story dari hasil elisitasi', 'Menentukan prioritas MoSCoW']);
  await produce(s, 'anggrek', { type: 'BRD', title: 'Business Requirements Document', format: 'markdown', content: c.brd });
  decide(s, 'anggrek', 'Notifikasi pengingat (FR-09) berprioritas Could', 'Nilai bisnisnya ada, tetapi bergantung pada gateway pihak ketiga. Ditunda agar rilis pertama fokus pada transaksi inti.');
  done(s, 'anggrek', ['T2', 'T3']);
}

async function melatiWork({ s, p, c }: Ctx) {
  await steps(s, 'melati', ['Menganalisis alur proses bisnis dari BRD', 'Menetapkan entitas eksternal dan batas sistem']);
  await produce(s, 'melati', { type: 'DFD', title: 'DFD Level 0 (Diagram Konteks)', format: 'mermaid', content: c.dfd0 });
  await steps(s, 'melati', ['Memecah proses menjadi DFD Level 1']);
  await produce(s, 'melati', { type: 'DFD', title: 'DFD Level 1', format: 'mermaid', content: c.dfd1 });
  s.setTaskStatus('T4', 'selesai');
  await steps(s, 'melati', ['Menyusun ERD', `Memisahkan detail ${p.trx.toLowerCase()} agar memenuhi 1NF`]);
  await produce(s, 'melati', { type: 'ERD', title: 'Entity Relationship Diagram', format: 'mermaid', content: c.erd });
  decide(s, 'melati', `Nilai ${p.extra.toLowerCase()} disimpan sebagai entitas tersendiri`, 'Walau bisa dihitung ulang, nilainya perlu jejak audit dan status sendiri, sehingga tidak cukup sebagai atribut turunan.');
  await steps(s, 'melati', ['Menulis kamus data dan catatan normalisasi sampai 3NF']);
  await produce(s, 'melati', { type: 'Kamus Data', title: 'Kamus Data dan Normalisasi', format: 'markdown', content: c.kamus });
  done(s, 'melati', ['T4', 'T5']);
}

async function mawarWork({ s, c }: Ctx) {
  await steps(s, 'mawar', ['Memetakan perjalanan pengguna per peran', 'Menyusun user flow']);
  await produce(s, 'mawar', { type: 'User Flow', title: 'User Flow', format: 'mermaid', content: c.userflow });
  s.setTaskStatus('T6', 'selesai');
  await steps(s, 'mawar', ['Membuat sketsa wireframe low-fidelity', 'Menulis spesifikasi antarmuka per layar']);
  await produce(s, 'mawar', { type: 'Wireframe', title: 'Wireframe dan Spesifikasi Antarmuka', format: 'markdown', content: c.wireframe });
  decide(s, 'mawar', 'Navigasi samping tetap dengan maksimal 3 klik ke fungsi utama', 'Petugas memakai sistem berulang kali sepanjang hari; jalur pendek mengurangi waktu layanan per transaksi.');
  done(s, 'mawar', ['T6', 'T7']);
}

async function lavenderWork({ s, p, c }: Ctx) {
  await steps(s, 'lavender', ['Menurunkan use case dari kebutuhan fungsional']);
  await produce(s, 'lavender', { type: 'UML', title: 'Use Case Diagram', format: 'mermaid', content: c.usecase });
  s.setTaskStatus('T8', 'selesai');
  await steps(s, 'lavender', [`Memodelkan sequence untuk ${p.trx.toLowerCase()}`]);
  await produce(s, 'lavender', { type: 'UML', title: `Sequence Diagram — Catat ${p.trx}`, format: 'mermaid', content: c.sequence });
  await steps(s, 'lavender', [`Memodelkan activity untuk ${p.balik.toLowerCase()}`]);
  await produce(s, 'lavender', { type: 'UML', title: `Activity Diagram — Proses ${p.balik}`, format: 'mermaid', content: c.activity });
  await steps(s, 'lavender', ['Menyusun class diagram dari ERD']);
  await produce(s, 'lavender', { type: 'UML', title: 'Class Diagram', format: 'mermaid', content: c.klass });
  s.setTaskStatus('T9', 'selesai');
  await steps(s, 'lavender', ['Menulis spesifikasi fungsional per use case']);
  await produce(s, 'lavender', { type: 'SRS', title: 'Spesifikasi Fungsional', format: 'markdown', content: c.spesifikasi });
  decide(s, 'lavender', 'Arsitektur tiga lapis: antarmuka web, layanan API, basis data', 'Memisahkan aturan bisnis dari tampilan sehingga aplikasi mobile bisa ditambahkan nanti tanpa mengubah logika.');
  done(s, 'lavender', ['T8', 'T9', 'T10']);
}

async function validate(ctx: Ctx, round: 1 | 2) {
  const { s, c } = ctx;
  await steps(s, 'teratai', round === 1
    ? ['Memvalidasi kebutuhan terhadap use case', 'Mencocokkan entitas ERD dengan kebutuhan', 'Memeriksa setiap use case punya alur di DFD']
    : ['Memeriksa ulang DFD Level 1 versi 2', 'Memperbarui matriks keterlacakan']);
  s.setValidation({ round, checklist: c.checklist(round), matrix: c.matrix(round) });
  s.log('teratai', 'tool_call', `report_validation ${JSON.stringify({ round, gagal: round === 1 ? 1 : 0 })}`);
  await produce(s, 'teratai', { type: 'Validasi', title: 'Matriks Keterlacakan Kebutuhan', format: 'markdown', content: c.rtmDoc(round) });
}

// ---------- menyela lewat chat ----------

async function handleInbox(ctx: Ctx) {
  const { s, c } = ctx;
  while (s.inbox.length) {
    const text = s.inbox.shift()!;
    const no = ctx.addenda.length + 1;
    ctx.addenda.push(text);
    const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;

    s.startWork('azza', 'Menyesuaikan roadmap', `Permintaan baru diterima: "${short}"`);
    s.log('azza', 'pesan', `Menyesuaikan roadmap untuk permintaan: "${short}"`);
    await s.pause(1800);
    const ids = { a: `A${no}.1`, d: `A${no}.2`, v: `A${no}.3` };
    s.upsertTask({ id: ids.a, phase: 'analisis', title: `Kebutuhan tambahan: ${short}`, agent: 'anggrek' });
    s.upsertTask({ id: ids.d, phase: 'desain', title: `Spesifikasi: ${short}`, agent: 'lavender' });
    s.upsertTask({ id: ids.v, phase: 'validasi', title: `Validasi adendum ${no}`, agent: 'teratai' });
    s.log('azza', 'tool_call', `set_roadmap ${JSON.stringify({ tambah: [ids.a, ids.d, ids.v] })}`);
    decide(s, 'azza', `Permintaan pengguna ditampung sebagai Adendum ${no}`, `"${short}" ditambahkan tanpa mengulang fase yang sudah selesai; dampaknya ke artefak lain dicatat di adendum.`);

    await delegate(s, 'anggrek', [ids.a], `Tulis kebutuhan untuk: ${short}`);
    azzaBack(s, 'Menunggu Anggrek');
    await steps(s, 'anggrek', ['Menulis user story dan kebutuhan tambahan']);
    done(s, 'anggrek', [ids.a]);

    await delegate(s, 'lavender', [ids.d], `Spesifikasikan: ${short}`);
    azzaBack(s, 'Menunggu Lavender');
    await steps(s, 'lavender', ['Menyusun spesifikasi dan dampak ke artefak']);
    await produce(s, 'lavender', { type: 'SRS', title: `Adendum ${no}`, format: 'markdown', content: c.adendum(text, no) });
    done(s, 'lavender', [ids.d]);

    await delegate(s, 'teratai', [ids.v], `Validasi Adendum ${no}`);
    azzaBack(s, 'Menunggu Teratai');
    await steps(s, 'teratai', ['Memeriksa adendum terhadap matriks keterlacakan']);
    const v = s.state.validation;
    if (v) {
      s.setValidation({
        round: v.round,
        checklist: v.checklist,
        matrix: [...v.matrix, { reqId: `FR-A${no}.1`, requirement: text, links: [`Adendum ${no}`], status: 'lulus' }],
      });
    }
    done(s, 'teratai', [ids.v]);
    azzaBack(s, 'Adendum selesai');
  }
}

async function finalPackage(ctx: Ctx) {
  const { s, c } = ctx;
  s.setTaskStatus('T14', 'berjalan');
  s.startWork('azza', 'Menyusun paket dokumentasi akhir (SRS lengkap)');
  await steps(s, 'azza', ['Menggabungkan seluruh artefak tim', 'Menyusun SRS lengkap']);
  await produce(s, 'azza', { type: 'SRS', title: 'SRS Lengkap (Paket Akhir)', format: 'markdown', content: c.srs(ctx.addenda) }, { board: false });
  s.setTaskStatus('T14', 'selesai');
  s.log('azza', 'pesan', 'Paket dokumentasi akhir siap diunduh di tab Output.');
  s.say('azza', 'Semua fase selesai 🎉');
  await s.pause(2200);
}

// ---------- alur utama ----------

export class DemoEngine implements Engine {
  async run(s: Session) {
    const p = profileFor(s.state.brief);
    const ctx: Ctx = { s, p, c: buildContent(p), addenda: [] };
    ctxBySession.set(s, ctx);
    const { c } = ctx;

    s.log('sistem', 'sistem', 'Mode demo aktif: aktivitas dan dokumen berasal dari data simulasi.');
    await s.pause(900);

    // 1) Perencanaan
    s.startWork('azza', 'Menyusun rencana analisis');
    await steps(s, 'azza', ['Membaca brief proyek', 'Memecah pekerjaan menjadi fase SDLC']);
    const plan: [string, PhaseId, string, AgentId][] = [
      ['T1', 'perencanaan', 'Rencana analisis dan roadmap', 'azza'],
      ['T2', 'analisis', 'Elisitasi kebutuhan dan peta stakeholder', 'anggrek'],
      ['T3', 'analisis', 'User story, BRD, dan prioritas MoSCoW', 'anggrek'],
      ['T4', 'analisis', 'DFD Level 0 dan Level 1', 'melati'],
      ['T5', 'analisis', 'ERD, kamus data, dan normalisasi', 'melati'],
      ['T6', 'desain', 'User flow', 'mawar'],
      ['T7', 'desain', 'Wireframe dan spesifikasi antarmuka', 'mawar'],
      ['T8', 'desain', 'Use case diagram', 'lavender'],
      ['T9', 'desain', 'Sequence, activity, dan class diagram', 'lavender'],
      ['T10', 'desain', 'Spesifikasi fungsional', 'lavender'],
      ['T11', 'validasi', 'Validasi kebutuhan dan matriks keterlacakan', 'teratai'],
      ['T12', 'validasi', 'Review konsistensi antar artefak', 'teratai'],
      ['T13', 'dokumentasi', 'Ringkasan untuk stakeholder', 'teratai'],
      ['T14', 'dokumentasi', 'Paket dokumentasi akhir (SRS lengkap)', 'azza'],
    ];
    for (const [id, phase, title, agent] of plan) s.upsertTask({ id, phase, title, agent });
    s.log('azza', 'tool_call', `set_roadmap ${JSON.stringify({ fase: 5, tugas: plan.length })}`);
    s.log('azza', 'tool_ok', `tool_ok · ${rand(30, 90)}ms`);
    s.setTaskStatus('T1', 'berjalan');
    await produce(s, 'azza', { type: 'Rencana', title: 'Rencana Analisis', format: 'markdown', content: c.rencana });
    decide(s, 'azza', 'Memakai SDLC lima fase dengan validasi silang sebelum dokumentasi', 'Validasi di tengah mencegah celah antar artefak terbawa ke SRS akhir, sehingga revisi lebih murah.');
    s.setTaskStatus('T1', 'selesai');
    await handleInbox(ctx);

    // 2) Analisis kebutuhan — berurutan
    await delegate(s, 'anggrek', ['T2', 'T3'], 'Elisitasi kebutuhan, peta stakeholder, dan BRD');
    azzaBack(s, 'Menunggu hasil Anggrek');
    await anggrekWork(ctx);
    await handleInbox(ctx);

    // 3) Pemodelan dan desain antarmuka — paralel
    s.log('azza', 'pesan', 'BRD diterima. Mendelegasikan pemodelan dan desain antarmuka secara paralel.');
    await delegate(s, 'melati', ['T4', 'T5'], 'Buat DFD level 0–1, ERD, dan kamus data');
    await delegate(s, 'mawar', ['T6', 'T7'], 'Susun user flow dan wireframe');
    azzaBack(s, 'Menunggu Melati dan Mawar');
    await Promise.all([melatiWork(ctx), mawarWork(ctx)]);
    await handleInbox(ctx);

    // 4) Desain sistem
    await delegate(s, 'lavender', ['T8', 'T9', 'T10'], 'Buat diagram UML dan spesifikasi fungsional');
    azzaBack(s, 'Menunggu hasil Lavender');
    await lavenderWork(ctx);
    await handleInbox(ctx);

    // 5) Validasi putaran 1 → celah → revisi → putaran 2
    await delegate(s, 'teratai', ['T11', 'T12'], 'Validasi kebutuhan dan review konsistensi antar artefak');
    azzaBack(s, 'Menunggu hasil validasi');
    await validate(ctx, 1);
    s.setTaskStatus('T11', 'selesai');
    s.log('teratai', 'pesan', 'Celah ditemukan: UC-06 Lihat Laporan belum punya alur di DFD Level 1.');
    s.setAgent('teratai', { anim: 'berbicara', target: 'azza', bubble: 'Azza, ada celah: UC-06 belum ada di DFD.' });
    await s.pause(2800);
    s.wait('teratai', 'Menunggu revisi DFD');
    s.setTaskStatus('T4', 'revisi');

    await delegate(s, 'melati', [], 'Revisi DFD Level 1: tambahkan proses pelaporan untuk UC-06');
    azzaBack(s, 'Menunggu revisi Melati');
    await steps(s, 'melati', ['Menambahkan proses 5.0 Pelaporan dan aliran datanya']);
    await produce(s, 'melati', { type: 'DFD', title: 'DFD Level 1', format: 'mermaid', content: c.dfd1v2 });
    decide(s, 'melati', 'Menambah proses 5.0 Pelaporan pada DFD Level 1', 'Temuan validasi: use case UC-06 dan kebutuhan FR-08 belum punya alur data. Proses baru membaca data transaksi dan menghasilkan laporan untuk pimpinan.');
    done(s, 'melati', ['T4']);

    s.startWork('teratai', 'Validasi ulang setelah revisi');
    await validate(ctx, 2);
    s.log('teratai', 'pesan', 'Semua pemeriksaan lulus; satu catatan terbuka untuk uji beban.');
    s.setTaskStatus('T12', 'selesai');
    await handleInbox(ctx);

    // 6) Dokumentasi
    s.setTaskStatus('T13', 'berjalan');
    s.startWork('teratai', 'Menulis ringkasan untuk stakeholder');
    await steps(s, 'teratai', ['Merangkum hasil dalam bahasa non-teknis']);
    await produce(s, 'teratai', { type: 'Ringkasan', title: 'Ringkasan untuk Stakeholder', format: 'markdown', content: c.ringkasan });
    done(s, 'teratai', ['T13']);
    await handleInbox(ctx);

    await finalPackage(ctx);
  }

  async resume(s: Session) {
    const ctx = ctxBySession.get(s);
    if (!ctx) return;
    await handleInbox(ctx);
    // SRS diterbitkan ulang agar memuat adendum terbaru.
    await finalPackage(ctx);
  }
}
