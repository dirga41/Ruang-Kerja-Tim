import type { TraceRow, ValidationCheck } from '../shared/types';

/**
 * Konten simulasi untuk mode demo. Semua artefak dibangkitkan dari sebuah
 * "profil domain" sehingga brief selain seed tetap menghasilkan dokumen
 * yang masuk akal (nama aktor, entitas, dan transaksi menyesuaikan).
 */
export interface Profile {
  sistem: string;
  /** pengguna utama, mis. Anggota */
  aktor: string;
  /** petugas operasional, mis. Pustakawan */
  petugas: string;
  /** data induk utama, mis. Buku */
  item: string;
  kategori: string;
  /** transaksi inti, mis. Peminjaman */
  trx: string;
  /** penutup transaksi, mis. Pengembalian */
  balik: string;
  /** entitas turunan, mis. Denda */
  extra: string;
  extraReq: string;
  itemFields: [string, string, string][];
  extraFields: [string, string, string][];
  aturan: string[];
}

const PERPUSTAKAAN: Omit<Profile, 'sistem'> = {
  aktor: 'Anggota', petugas: 'Pustakawan', item: 'Buku', kategori: 'Kategori',
  trx: 'Peminjaman', balik: 'Pengembalian', extra: 'Denda',
  extraReq: 'Sistem menghitung denda keterlambatan secara otomatis saat pengembalian',
  itemFields: [['string', 'isbn', 'ISBN 13 digit'], ['string', 'judul', 'Judul buku'], ['string', 'penulis', 'Nama penulis'], ['int', 'stok_tersedia', 'Jumlah eksemplar yang bisa dipinjam']],
  extraFields: [['int', 'hari_terlambat', 'Selisih hari dari jatuh tempo'], ['decimal', 'jumlah', 'Nominal denda (Rp)'], ['string', 'status_bayar', 'belum / lunas']],
  aturan: ['Maksimal 3 buku aktif per anggota', 'Masa pinjam 7 hari, dapat diperpanjang satu kali', 'Denda Rp1.000 per buku per hari keterlambatan', 'Anggota dengan denda belum lunas tidak dapat meminjam'],
};

const INVENTARIS: Omit<Profile, 'sistem'> = {
  aktor: 'Pemasok', petugas: 'Staf Gudang', item: 'Barang', kategori: 'Kategori',
  trx: 'Barang Masuk', balik: 'Barang Keluar', extra: 'Penyesuaian Stok',
  extraReq: 'Sistem mencatat penyesuaian stok hasil stok opname beserta alasannya',
  itemFields: [['string', 'sku', 'Kode unik barang'], ['string', 'nama', 'Nama barang'], ['int', 'stok', 'Jumlah stok saat ini'], ['int', 'stok_minimum', 'Ambang peringatan stok']],
  extraFields: [['int', 'selisih', 'Selisih fisik vs sistem'], ['string', 'alasan', 'Rusak / hilang / salah catat'], ['date', 'tanggal', 'Tanggal penyesuaian']],
  aturan: ['Stok tidak boleh bernilai negatif', 'Peringatan muncul saat stok ≤ stok minimum', 'Setiap mutasi stok wajib punya dokumen sumber', 'Penyesuaian stok memerlukan persetujuan pemilik toko'],
};

const UMUM: Omit<Profile, 'sistem'> = {
  aktor: 'Pengguna', petugas: 'Petugas', item: 'Layanan', kategori: 'Kategori',
  trx: 'Pengajuan', balik: 'Penyelesaian', extra: 'Notifikasi',
  extraReq: 'Sistem mengirim notifikasi setiap kali status pengajuan berubah',
  itemFields: [['string', 'kode', 'Kode unik'], ['string', 'nama', 'Nama layanan'], ['string', 'deskripsi', 'Uraian singkat'], ['boolean', 'aktif', 'Status ketersediaan']],
  extraFields: [['string', 'kanal', 'email / WhatsApp / in-app'], ['string', 'pesan', 'Isi notifikasi'], ['datetime', 'dikirim_pada', 'Waktu pengiriman']],
  aturan: ['Setiap pengajuan memiliki satu penanggung jawab', 'Status hanya dapat maju sesuai alur yang ditetapkan', 'Seluruh perubahan status tercatat di log audit', 'Pengguna hanya dapat melihat pengajuannya sendiri'],
};

export function profileFor(brief: string): Profile {
  const b = brief.toLowerCase();
  const base = /perpus|pustaka|library|buku/.test(b) ? PERPUSTAKAAN : /inventaris|stok|gudang|toko|inventory/.test(b) ? INVENTARIS : UMUM;
  const sistem = brief.split(/[.\n]/)[0].trim().slice(0, 80) || 'Sistem Informasi';
  return { sistem, ...base };
}

const idOf = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const lower = (s: string) => s.toLowerCase();

export interface DemoContent {
  rencana: string;
  stakeholder: string;
  brd: string;
  dfd0: string;
  dfd1: string;
  dfd1v2: string;
  erd: string;
  kamus: string;
  userflow: string;
  wireframe: string;
  usecase: string;
  sequence: string;
  activity: string;
  klass: string;
  spesifikasi: string;
  ringkasan: string;
  srs: (addenda: string[]) => string;
  adendum: (permintaan: string, no: number) => string;
  checklist: (round: 1 | 2) => ValidationCheck[];
  matrix: (round: 1 | 2) => TraceRow[];
  rtmDoc: (round: 1 | 2) => string;
}

export function buildContent(p: Profile): DemoContent {
  const A = idOf(p.aktor), P = idOf(p.petugas), I = idOf(p.item), K = idOf(p.kategori);
  const T = idOf(p.trx), D = `DETAIL_${T}`, X = idOf(p.extra);
  const a = lower(p.aktor), pt = lower(p.petugas), it = lower(p.item), tr = lower(p.trx), bl = lower(p.balik), ex = lower(p.extra);

  const reqs: [string, string, string][] = [
    ['FR-01', 'Autentikasi dan hak akses berbasis peran', 'Must'],
    ['FR-02', `Kelola data ${it} dan ${lower(p.kategori)}`, 'Must'],
    ['FR-03', `Kelola data ${a}`, 'Must'],
    ['FR-04', `Catat transaksi ${tr}`, 'Must'],
    ['FR-05', `Proses ${bl}`, 'Must'],
    ['FR-06', p.extraReq, 'Should'],
    ['FR-07', `Pencarian dan penelusuran katalog ${it}`, 'Should'],
    ['FR-08', 'Laporan periodik dan dasbor ringkasan', 'Should'],
    ['FR-09', 'Notifikasi pengingat lewat email/WhatsApp', 'Could'],
    ['FR-10', 'Integrasi SSO dan sistem eksternal', "Won't (fase ini)"],
  ];

  const rencana = `# Rencana Analisis — ${p.sistem}

## Tujuan
Menghasilkan paket dokumen analisis dan desain sistem yang konsisten dan siap diserahkan ke tim pengembang.

## Pendekatan
Siklus SDLC lima fase dengan validasi silang antar artefak sebelum dokumentasi akhir.

| Fase | Fokus | Penanggung jawab | Keluaran |
|---|---|---|---|
| Perencanaan | Ruang lingkup, rencana kerja | Azza | Rencana analisis, roadmap |
| Analisis | Kebutuhan, proses, data | Anggrek, Melati | Peta stakeholder, BRD, DFD, ERD, kamus data |
| Desain | Antarmuka dan perilaku sistem | Mawar, Lavender | User flow, wireframe, UML, spesifikasi fungsional |
| Validasi | Konsistensi dan keterlacakan | Teratai | Matriks keterlacakan, checklist QA |
| Dokumentasi | Paket akhir | Teratai, Azza | Ringkasan stakeholder, SRS lengkap |

## Ruang lingkup awal
- **Termasuk:** pengelolaan ${it}, ${a}, ${tr}, ${bl}, ${ex}, dan pelaporan.
- **Tidak termasuk:** integrasi pembayaran daring dan aplikasi mobile native.

## Risiko
1. Aturan bisnis belum tertulis resmi → dikonfirmasi lewat BRD.
2. Artefak tidak sinkron antar agent → dicegah dengan review Teratai.
`;

  const stakeholder = `flowchart LR
    S(("${p.sistem}"))
    subgraph Utama["Pengguna utama"]
      A1["${p.aktor}"]
      A2["${p.petugas}"]
    end
    subgraph Pengelola["Pengelola"]
      A3["Admin Sistem"]
      A4["Pimpinan Unit"]
    end
    subgraph Pendukung["Pendukung"]
      A5["Tim TI"]
      A6["Bagian Keuangan"]
    end
    A1 -- "memakai layanan" --> S
    A2 -- "mengoperasikan" --> S
    A3 -- "mengonfigurasi" --> S
    S -- "laporan" --> A4
    A5 -- "memelihara" --> S
    S -- "rekap ${ex}" --> A6
`;

  const brd = `# Business Requirements Document (BRD) — ${p.sistem}

## 1. Latar belakang
Proses ${tr} dan ${bl} saat ini dicatat manual sehingga data ${it} sering tidak akurat, antrean layanan panjang, dan laporan disusun terlambat.

## 2. Tujuan bisnis
1. Memangkas waktu layanan ${tr} menjadi kurang dari 2 menit per transaksi.
2. Menjaga akurasi data ${it} minimal 99%.
3. Menyediakan laporan bulanan otomatis untuk pimpinan.

## 3. Stakeholder
| Stakeholder | Kepentingan | Pengaruh |
|---|---|---|
| ${p.aktor} | Layanan cepat dan informasi yang jelas | Sedang |
| ${p.petugas} | Pencatatan mudah, minim input ulang | Tinggi |
| Admin Sistem | Kelola pengguna dan data induk | Tinggi |
| Pimpinan Unit | Laporan dan indikator kinerja | Tinggi |
| Tim TI | Sistem mudah dipelihara | Sedang |

## 4. User story
- **US-01** Sebagai ${a}, saya ingin mencari ${it} agar tahu ketersediaannya sebelum datang.
- **US-02** Sebagai ${pt}, saya ingin mencatat ${tr} dengan memindai kode agar layanan cepat.
- **US-03** Sebagai ${pt}, saya ingin memproses ${bl} agar status ${it} langsung diperbarui.
- **US-04** Sebagai admin, saya ingin mengelola data ${it} dan ${a} agar data induk selalu mutakhir.
- **US-05** Sebagai pimpinan, saya ingin melihat laporan periodik agar bisa mengambil keputusan.
- **US-06** Sebagai ${a}, saya ingin menerima pengingat agar tidak melewatkan tenggat.

## 5. Kebutuhan fungsional dan prioritas MoSCoW
| ID | Kebutuhan | Prioritas |
|---|---|---|
${reqs.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n')}

## 6. Aturan bisnis
${p.aturan.map((x, i) => `- **BR-0${i + 1}** ${x}`).join('\n')}

## 7. Kebutuhan non-fungsional
- **NFR-01** Waktu respons halaman < 2 detik pada 100 pengguna bersamaan.
- **NFR-02** Ketersediaan layanan 99,5% pada jam operasional.
- **NFR-03** Kata sandi disimpan dengan hash; seluruh akses lewat HTTPS.
- **NFR-04** Antarmuka dapat dipakai di layar 360 px ke atas.
`;

  const dfd0 = `flowchart LR
    A["${p.aktor}"]
    P["${p.petugas}"]
    AD["Admin Sistem"]
    PM["Pimpinan Unit"]
    S(("0 · ${p.sistem}"))
    A -- "permintaan pencarian" --> S
    S -- "info ${it} dan status" --> A
    P -- "data ${tr} dan ${bl}" --> S
    S -- "bukti transaksi" --> P
    AD -- "data induk" --> S
    S -- "laporan periodik" --> PM
`;

  const dfd1Base = (withReport: boolean) => `flowchart TB
    A["${p.aktor}"]
    P["${p.petugas}"]
    AD["Admin Sistem"]
    PM["Pimpinan Unit"]
    P1(["1.0 Kelola Data Induk"])
    P2(["2.0 Pencarian Katalog"])
    P3(["3.0 ${p.trx}"])
    P4(["4.0 ${p.balik} dan ${p.extra}"])
${withReport ? '    P5(["5.0 Pelaporan"])\n' : ''}    D1[("D1 ${p.item}")]
    D2[("D2 ${p.aktor}")]
    D3[("D3 ${p.trx}")]
    D4[("D4 ${p.extra}")]
    AD -- "data ${it} dan ${a}" --> P1
    P1 --> D1
    P1 --> D2
    A -- "kata kunci" --> P2
    D1 --> P2
    P2 -- "hasil pencarian" --> A
    P -- "data ${tr}" --> P3
    D2 --> P3
    D1 --> P3
    P3 --> D3
    P3 -- "bukti ${tr}" --> P
    P -- "data ${bl}" --> P4
    D3 --> P4
    P4 --> D4
    P4 -- "pembaruan status" --> D1
${withReport ? `    D3 --> P5
    D4 --> P5
    PM -- "parameter periode" --> P5
    P5 -- "laporan dan dasbor" --> PM
` : ''}`;

  const field = (rows: [string, string, string][]) => rows.map((f) => `        ${f[0]} ${f[1]}`).join('\n');
  const erd = `erDiagram
    ${A} ||--o{ ${T} : melakukan
    ${P} ||--o{ ${T} : mencatat
    ${T} ||--|{ ${D} : memuat
    ${I} ||--o{ ${D} : tercantum
    ${K} ||--o{ ${I} : mengelompokkan
    ${T} ||--o{ ${X} : menimbulkan
    ${A} {
        int id_${idOf(p.aktor).toLowerCase()} PK
        string nama
        string email
        string status
    }
    ${P} {
        int id_petugas PK
        string nama
        string peran
    }
    ${K} {
        int id_kategori PK
        string nama
    }
    ${I} {
        int id_${I.toLowerCase()} PK
        int id_kategori FK
${field(p.itemFields)}
    }
    ${T} {
        int id_${T.toLowerCase()} PK
        int id_${A.toLowerCase()} FK
        int id_petugas FK
        date tanggal
        date jatuh_tempo
        string status
    }
    ${D} {
        int id_detail PK
        int id_${T.toLowerCase()} FK
        int id_${I.toLowerCase()} FK
        int jumlah
    }
    ${X} {
        int id_${X.toLowerCase()} PK
        int id_${T.toLowerCase()} FK
${field(p.extraFields)}
    }
`;

  const kamus = `# Kamus Data dan Normalisasi — ${p.sistem}

## Entitas ${I}
| Atribut | Tipe | Kunci | Keterangan |
|---|---|---|---|
| id_${I.toLowerCase()} | int | PK | Penanda unik |
| id_kategori | int | FK | Mengacu ke ${K} |
${p.itemFields.map((f) => `| ${f[1]} | ${f[0]} | – | ${f[2]} |`).join('\n')}

## Entitas ${T}
| Atribut | Tipe | Kunci | Keterangan |
|---|---|---|---|
| id_${T.toLowerCase()} | int | PK | Penanda unik transaksi |
| id_${A.toLowerCase()} | int | FK | ${p.aktor} terkait |
| id_petugas | int | FK | ${p.petugas} pencatat |
| tanggal | date | – | Tanggal transaksi |
| jatuh_tempo | date | – | Batas penyelesaian |
| status | string | – | aktif / selesai / terlambat |

## Entitas ${X}
| Atribut | Tipe | Kunci | Keterangan |
|---|---|---|---|
| id_${X.toLowerCase()} | int | PK | Penanda unik |
| id_${T.toLowerCase()} | int | FK | Transaksi asal |
${p.extraFields.map((f) => `| ${f[1]} | ${f[0]} | – | ${f[2]} |`).join('\n')}

## Catatan normalisasi
- **1NF** — atribut berulang (daftar ${it} dalam satu transaksi) dipisah ke tabel \`${D}\`.
- **2NF** — atribut ${it} tidak disimpan di \`${D}\` karena hanya bergantung pada \`id_${I.toLowerCase()}\`.
- **3NF** — nama ${lower(p.kategori)} dipindah ke tabel \`${K}\` untuk menghilangkan ketergantungan transitif.
- Seluruh tabel memenuhi 3NF; tidak ada atribut turunan yang disimpan selain nilai ${ex} demi jejak audit.
`;

  const userflow = `flowchart TD
    M(["Mulai"]) --> L["Login"]
    L --> R{"Peran?"}
    R -- "${p.aktor}" --> C["Cari ${it}"]
    C --> DT["Lihat detail dan ketersediaan"]
    DT --> RW["Riwayat ${tr} saya"]
    R -- "${p.petugas}" --> DS["Dasbor operasional"]
    DS --> TP["Form ${p.trx}"]
    TP --> V{"Memenuhi aturan?"}
    V -- "Ya" --> OK["Simpan dan cetak bukti"]
    V -- "Tidak" --> ER["Tampilkan alasan penolakan"]
    DS --> PB["Form ${p.balik}"]
    PB --> HX["Hitung ${ex} bila ada"]
    R -- "Pimpinan" --> LP["Laporan dan dasbor"]
    OK --> S(["Selesai"])
    HX --> S
    RW --> S
    LP --> S
`;

  const wireframe = `# Wireframe Low-Fidelity dan Spesifikasi Antarmuka — ${p.sistem}

## W-01 Dasbor ${p.petugas}
\`\`\`text
+--------------------------------------------------------------+
| [Logo] ${p.sistem.slice(0, 28).padEnd(28)}        (Nama) [Keluar] |
+----------+---------------------------------------------------+
| Dasbor   |  [ ${p.trx} hari ini ] [ Jatuh tempo ] [ ${p.extra} ]  |
| ${p.item.padEnd(8).slice(0, 8)} |  ------------------------------------------------ |
| ${p.aktor.padEnd(8).slice(0, 8)} |  Transaksi terbaru                                |
| Transaksi|  | No | ${p.aktor.padEnd(10).slice(0, 10)} | ${p.item.padEnd(10).slice(0, 10)} | Status   |        |
| Laporan  |  |----|------------|------------|----------|        |
|          |  [ + ${p.trx} baru ]   [ Proses ${p.balik} ]          |
+----------+---------------------------------------------------+
\`\`\`

## W-02 Form ${p.trx}
\`\`\`text
+------------------------------------------------+
| ${p.trx} baru                                  |
| ${p.aktor}  : [ pindai / ketik ID ........ ] [Cek]  |
| ${p.item}   : [ pindai / ketik kode ...... ] [+]    |
|   1. ................................... [x]   |
|   2. ................................... [x]   |
| Jatuh tempo : [ otomatis ]                     |
|                    [ Batal ]   [ Simpan ]      |
+------------------------------------------------+
\`\`\`

## W-03 Pencarian katalog (${p.aktor})
\`\`\`text
+------------------------------------------------+
| [ Cari ${it} ....................... ] [Cari]  |
| Filter: [${p.kategori} v] [Tersedia saja []]    |
| ---------------------------------------------- |
| > Judul/Nama ............... | Tersedia: 3     |
| > Judul/Nama ............... | Habis           |
+------------------------------------------------+
\`\`\`

## Spesifikasi antarmuka
| Layar | Komponen | Perilaku | Kebutuhan |
|---|---|---|---|
| W-01 | Kartu ringkasan | Memuat ulang tiap 60 detik | FR-08 |
| W-01 | Tabel transaksi | Urut terbaru, 10 baris per halaman | FR-04 |
| W-02 | Kolom ${p.aktor} | Validasi status sebelum lanjut | FR-03, FR-04 |
| W-02 | Tombol Simpan | Nonaktif sampai minimal 1 ${it} dipilih | FR-04 |
| W-03 | Kolom pencarian | Hasil muncul setelah 3 karakter | FR-07 |

**Prinsip:** maksimal 3 klik ke fungsi utama, pesan galat menyebut sebab dan cara memperbaikinya, kontras teks minimal 4,5:1.
`;

  const usecase = `flowchart LR
    AK["👤 ${p.aktor}"]
    PT["👤 ${p.petugas}"]
    AD["👤 Admin Sistem"]
    PM["👤 Pimpinan Unit"]
    subgraph SYS["${p.sistem}"]
      UC1(["UC-01 Login"])
      UC2(["UC-02 Kelola ${p.item}"])
      UC3(["UC-03 Kelola ${p.aktor}"])
      UC4(["UC-04 Catat ${p.trx}"])
      UC5(["UC-05 Proses ${p.balik}"])
      UC6(["UC-06 Lihat Laporan"])
      UC7(["UC-07 Cari ${p.item}"])
    end
    AK --- UC1
    AK --- UC7
    PT --- UC1
    PT --- UC4
    PT --- UC5
    AD --- UC2
    AD --- UC3
    PM --- UC6
    UC4 -. "include" .-> UC1
    UC5 -. "extend: hitung ${ex}" .-> UC4
`;

  const sequence = `sequenceDiagram
    actor PT as ${p.petugas}
    participant UI as Antarmuka Web
    participant API as Layanan ${p.trx}
    participant DB as Basis Data
    PT->>UI: Pindai ID ${a} dan kode ${it}
    UI->>API: POST /${T.toLowerCase().replace(/_/g, '-')}
    API->>DB: Cek status ${a} dan ketersediaan
    DB-->>API: Hasil pengecekan
    alt Memenuhi aturan bisnis
        API->>DB: Simpan ${tr} dan detail
        API->>DB: Perbarui status ${it}
        API-->>UI: 201 Berhasil
        UI-->>PT: Tampilkan bukti ${tr}
    else Tidak memenuhi
        API-->>UI: 422 Ditolak beserta alasan
        UI-->>PT: Tampilkan pesan penolakan
    end
`;

  const activity = `flowchart TD
    S(["Mulai"]) --> A1["${p.petugas} membuka form ${p.balik}"]
    A1 --> A2["Pindai kode ${it}"]
    A2 --> A3{"Transaksi aktif ditemukan?"}
    A3 -- "Tidak" --> A4["Tampilkan pesan galat"] --> E(["Selesai"])
    A3 -- "Ya" --> A5{"Melewati jatuh tempo?"}
    A5 -- "Ya" --> A6["Catat ${p.extra}"]
    A5 -- "Tidak" --> A7["Tandai selesai"]
    A6 --> A7
    A7 --> A8["Perbarui status ${it}"]
    A8 --> A9["Cetak bukti ${bl}"] --> E
`;

  const klass = `classDiagram
    class ${pascal(p.aktor)} {
      +int id
      +String nama
      +String status
      +bolehBertransaksi() bool
    }
    class ${pascal(p.petugas)} {
      +int id
      +String nama
      +String peran
    }
    class ${pascal(p.item)} {
      +int id
      +String ${p.itemFields[1][1]}
      +tersedia() bool
    }
    class ${pascal(p.trx)} {
      +int id
      +Date tanggal
      +Date jatuhTempo
      +String status
      +tambahItem(item)
      +selesaikan()
    }
    class Detail${pascal(p.trx)} {
      +int jumlah
    }
    class ${pascal(p.extra)} {
      +int id
      +catat()
    }
    ${pascal(p.aktor)} "1" --> "0..*" ${pascal(p.trx)} : melakukan
    ${pascal(p.petugas)} "1" --> "0..*" ${pascal(p.trx)} : mencatat
    ${pascal(p.trx)} "1" *-- "1..*" Detail${pascal(p.trx)}
    Detail${pascal(p.trx)} "0..*" --> "1" ${pascal(p.item)}
    ${pascal(p.trx)} "1" --> "0..*" ${pascal(p.extra)} : menimbulkan
`;

  const spesifikasi = `# Spesifikasi Fungsional — ${p.sistem}

## UC-04 Catat ${p.trx}
| Unsur | Uraian |
|---|---|
| Aktor | ${p.petugas} |
| Prakondisi | ${p.petugas} sudah login; ${a} terdaftar dan berstatus aktif |
| Pemicu | ${p.petugas} memilih "${p.trx} baru" |
| Alur utama | 1. Pindai ID ${a} → 2. Sistem memvalidasi status → 3. Pindai kode ${it} → 4. Sistem memeriksa aturan bisnis → 5. Simpan → 6. Cetak bukti |
| Alur alternatif | 4a. Aturan dilanggar → sistem menolak dan menampilkan alasan |
| Pascakondisi | Transaksi tersimpan; status ${it} diperbarui |
| Kebutuhan | FR-04, BR-01, BR-02 |

## UC-05 Proses ${p.balik}
| Unsur | Uraian |
|---|---|
| Aktor | ${p.petugas} |
| Prakondisi | Ada transaksi ${tr} berstatus aktif |
| Alur utama | 1. Pindai kode ${it} → 2. Sistem menemukan transaksi → 3. Sistem memeriksa jatuh tempo → 4. Tandai selesai → 5. Perbarui status |
| Alur alternatif | 3a. Terlambat → sistem mencatat ${ex} |
| Pascakondisi | Transaksi selesai; ${ex} tercatat bila ada |
| Kebutuhan | FR-05, FR-06 |

## UC-06 Lihat Laporan
| Unsur | Uraian |
|---|---|
| Aktor | Pimpinan Unit |
| Alur utama | 1. Pilih periode → 2. Sistem merangkum transaksi dan ${ex} → 3. Tampilkan dasbor → 4. Unduh PDF/Excel |
| Kebutuhan | FR-08 |

## UC-07 Cari ${p.item}
| Unsur | Uraian |
|---|---|
| Aktor | ${p.aktor} |
| Alur utama | 1. Ketik kata kunci → 2. Sistem menampilkan hasil beserta ketersediaan → 3. Buka detail |
| Kebutuhan | FR-07 |
`;

  const matrix = (round: 1 | 2): TraceRow[] => [
    { reqId: 'FR-01', requirement: reqs[0][1], links: ['UC-01', 'W-01', `ERD ${P}`], status: 'lulus' },
    { reqId: 'FR-02', requirement: reqs[1][1], links: ['UC-02', 'DFD P1.0', `ERD ${I}`, `ERD ${K}`], status: 'lulus' },
    { reqId: 'FR-03', requirement: reqs[2][1], links: ['UC-03', 'DFD P1.0', `ERD ${A}`], status: 'lulus' },
    { reqId: 'FR-04', requirement: reqs[3][1], links: ['UC-04', 'DFD P3.0', `ERD ${T}`, `ERD ${D}`, 'W-02', 'Sequence'], status: 'lulus' },
    { reqId: 'FR-05', requirement: reqs[4][1], links: ['UC-05', 'DFD P4.0', 'Activity'], status: 'lulus' },
    { reqId: 'FR-06', requirement: reqs[5][1], links: ['UC-05', 'DFD P4.0', `ERD ${X}`], status: 'lulus' },
    { reqId: 'FR-07', requirement: reqs[6][1], links: ['UC-07', 'DFD P2.0', 'W-03'], status: 'lulus' },
    round === 1
      ? { reqId: 'FR-08', requirement: reqs[7][1], links: ['UC-06', 'W-01'], status: 'gagal' }
      : { reqId: 'FR-08', requirement: reqs[7][1], links: ['UC-06', 'DFD P5.0', 'W-01'], status: 'lulus' },
    { reqId: 'FR-09', requirement: reqs[8][1], links: ['Ditunda ke rilis 2'], status: 'perlu_tinjau' },
  ];

  const checklist = (round: 1 | 2): ValidationCheck[] => [
    { id: 'QA-01', item: 'Setiap kebutuhan Must/Should punya minimal satu use case', status: 'lulus', note: '8 dari 8 kebutuhan terpetakan.' },
    { id: 'QA-02', item: 'Setiap entitas ERD terhubung ke kebutuhan', status: 'lulus', note: `7 entitas, termasuk ${X} → FR-06.` },
    round === 1
      ? { id: 'QA-03', item: 'Setiap use case punya alur di DFD', status: 'gagal', note: 'UC-06 Lihat Laporan belum punya proses di DFD Level 1. Dikembalikan ke Melati.' }
      : { id: 'QA-03', item: 'Setiap use case punya alur di DFD', status: 'lulus', note: 'Proses 5.0 Pelaporan ditambahkan pada DFD Level 1 v2.' },
    { id: 'QA-04', item: 'Data store DFD cocok dengan entitas ERD', status: 'lulus', note: 'D1–D4 cocok dengan entitas induk dan transaksi.' },
    { id: 'QA-05', item: 'Setiap layar wireframe mengacu ke kebutuhan', status: 'lulus', note: 'W-01 sampai W-03 punya kolom kebutuhan.' },
    { id: 'QA-06', item: 'Istilah konsisten di semua artefak', status: 'lulus', note: `Istilah "${p.trx}", "${p.balik}", dan "${p.extra}" seragam.` },
    { id: 'QA-07', item: 'Kebutuhan dapat diuji (terukur, tidak ambigu)', status: 'perlu_tinjau', note: 'NFR-01 perlu skenario uji beban yang disepakati stakeholder.' },
  ];

  const badge = { lulus: 'Lulus', gagal: 'Gagal', perlu_tinjau: 'Perlu tinjauan' } as const;
  const rtmDoc = (round: 1 | 2) => `# Matriks Keterlacakan Kebutuhan — ${p.sistem}

Putaran validasi: **${round}**

| ID | Kebutuhan | Tertaut ke | Status |
|---|---|---|---|
${matrix(round).map((r) => `| ${r.reqId} | ${r.requirement} | ${r.links.join(', ')} | ${badge[r.status]} |`).join('\n')}

## Checklist QA
| ID | Pemeriksaan | Hasil | Catatan |
|---|---|---|---|
${checklist(round).map((c) => `| ${c.id} | ${c.item} | ${badge[c.status]} | ${c.note} |`).join('\n')}
`;

  const ringkasan = `# Ringkasan untuk Stakeholder — ${p.sistem}

## Inti dalam satu paragraf
Tim telah menyelesaikan analisis dan desain ${p.sistem}. Sistem akan mendigitalkan ${tr}, ${bl}, dan ${ex}, dilengkapi pencarian katalog dan laporan otomatis untuk pimpinan.

## Yang sudah disepakati
- 8 kebutuhan fungsional masuk rilis pertama (5 Must, 3 Should).
- Notifikasi pengingat (FR-09) ditunda ke rilis kedua; integrasi SSO di luar lingkup fase ini.
- Model data terdiri dari 7 entitas dan sudah memenuhi bentuk normal ketiga.

## Hasil validasi
- Semua kebutuhan rilis pertama tertaut ke use case, proses DFD, dan entitas data.
- Satu celah ditemukan dan sudah ditutup: alur pelaporan ditambahkan ke DFD Level 1.
- Satu catatan terbuka: skenario uji beban untuk NFR-01 perlu disepakati.

## Yang kami perlukan dari Anda
1. Konfirmasi aturan bisnis BR-01 sampai BR-04.
2. Persetujuan penundaan FR-09 ke rilis kedua.
3. Penunjukan narahubung untuk uji penerimaan pengguna.
`;

  const srs = (addenda: string[]) => `# Software Requirements Specification (SRS) — ${p.sistem}

Versi 1.${addenda.length} · Disusun oleh Tim Analis Sistem (Azza, Anggrek, Melati, Mawar, Lavender, Teratai)

## 1. Pendahuluan
### 1.1 Tujuan
Dokumen ini menetapkan kebutuhan perangkat lunak ${p.sistem} sebagai acuan pengembangan, pengujian, dan serah terima.

### 1.2 Ruang lingkup
Sistem berbasis web untuk mengelola ${it}, ${a}, ${tr}, ${bl}, ${ex}, serta pelaporan.

### 1.3 Definisi
| Istilah | Arti |
|---|---|
| ${p.aktor} | Pengguna layanan utama |
| ${p.petugas} | Petugas yang mencatat transaksi |
| ${p.trx} | Transaksi inti sistem |
| ${p.extra} | Catatan turunan dari transaksi |

## 2. Deskripsi umum
### 2.1 Pengguna dan karakteristiknya
${p.aktor} (akses mandiri, literasi digital beragam), ${p.petugas} (pemakaian intensif harian), Admin Sistem, dan Pimpinan Unit (konsumsi laporan).

### 2.2 Diagram konteks
\`\`\`mermaid
${dfd0}\`\`\`

## 3. Kebutuhan fungsional
| ID | Kebutuhan | Prioritas |
|---|---|---|
${reqs.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n')}

### 3.1 Use case
\`\`\`mermaid
${usecase}\`\`\`

### 3.2 Aturan bisnis
${p.aturan.map((x, i) => `- **BR-0${i + 1}** ${x}`).join('\n')}

## 4. Model proses
\`\`\`mermaid
${dfd1Base(true)}\`\`\`

## 5. Model data
\`\`\`mermaid
${erd}\`\`\`

Seluruh tabel memenuhi bentuk normal ketiga (3NF). Rincian atribut ada pada dokumen Kamus Data.

## 6. Perilaku sistem
### 6.1 Sequence — Catat ${p.trx}
\`\`\`mermaid
${sequence}\`\`\`

### 6.2 Activity — Proses ${p.balik}
\`\`\`mermaid
${activity}\`\`\`

## 7. Antarmuka pengguna
Tiga layar inti: W-01 Dasbor ${p.petugas}, W-02 Form ${p.trx}, W-03 Pencarian katalog. Rincian pada dokumen Wireframe.

## 8. Kebutuhan non-fungsional
- **NFR-01** Waktu respons < 2 detik pada 100 pengguna bersamaan.
- **NFR-02** Ketersediaan 99,5% pada jam operasional.
- **NFR-03** Hash kata sandi dan HTTPS untuk seluruh akses.
- **NFR-04** Responsif mulai lebar layar 360 px.

## 9. Keterlacakan
| ID | Tertaut ke | Status |
|---|---|---|
${matrix(2).map((r) => `| ${r.reqId} | ${r.links.join(', ')} | ${badge[r.status]} |`).join('\n')}
${addenda.length ? `
## 10. Adendum permintaan pengguna
${addenda.map((x, i) => `${i + 1}. ${x} — lihat dokumen "Adendum ${i + 1}".`).join('\n')}
` : ''}
## Lampiran
BRD, Kamus Data, Wireframe, Spesifikasi Fungsional, dan Matriks Keterlacakan tersedia sebagai artefak terpisah di tab Output.
`;

  const adendum = (permintaan: string, no: number) => `# Adendum ${no} — Permintaan Tambahan

> "${permintaan}"

## Kebutuhan baru
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-A${no}.1 | ${permintaan.charAt(0).toUpperCase() + permintaan.slice(1)} | Should |
| FR-A${no}.2 | Hak akses untuk fitur tambahan mengikuti peran yang sudah ada | Must |

## Dampak ke artefak
| Artefak | Perubahan |
|---|---|
| BRD | Tambah user story dan kebutuhan FR-A${no}.1 |
| DFD Level 1 | Tambah aliran data ke proses terkait |
| ERD | Ditinjau; tidak perlu entitas baru bila data sudah tersedia |
| Wireframe | Tambah titik masuk di menu samping |

## Spesifikasi singkat
| Unsur | Uraian |
|---|---|
| Aktor | ${p.petugas}, Pimpinan Unit |
| Alur utama | 1. Buka menu fitur → 2. Isi parameter → 3. Sistem memproses → 4. Hasil ditampilkan dan dapat diunduh |
| Kriteria terima | Hasil sesuai data transaksi; waktu respons < 3 detik |

## Validasi
Teratai memeriksa adendum ini terhadap matriks keterlacakan: kebutuhan baru tertaut ke spesifikasi di atas dan tidak bertentangan dengan aturan bisnis yang ada.
`;

  return {
    rencana, stakeholder, brd, dfd0, dfd1: dfd1Base(false), dfd1v2: dfd1Base(true), erd, kamus, userflow, wireframe,
    usecase, sequence, activity, klass, spesifikasi, ringkasan, srs, adendum, checklist, matrix, rtmDoc,
  };
}
