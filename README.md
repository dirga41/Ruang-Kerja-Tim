# Ruang Kerja Tim Analis Sistem

Dashboard yang menampilkan tim AI agent System Analyst bekerja di kantor virtual. Anda memberi brief proyek, lalu enam agent menjalankan siklus analisis sistem: elisitasi kebutuhan → pemodelan proses dan data → desain antarmuka → validasi → dokumentasi.

Versi ini dirancang untuk **satu kali deploy di Vercel**: satu proyek berisi frontend statis (Vite) dan dua fungsi kecil di folder `api/`. Tidak ada server yang harus hidup terus dan tidak ada database yang perlu disiapkan.

## Deploy ke Vercel

### Lewat GitHub (disarankan)

1. Buat repository baru di GitHub dan unggah isi folder ini.
2. Buka https://vercel.com/new, pilih repository tersebut.
3. Biarkan pengaturan bawaan (Framework: Vite, Build: `npm run build`, Output: `dist`), lalu klik **Deploy**.

Aplikasi langsung berjalan dalam **mode demo** (data simulasi, tanpa biaya).

### Lewat terminal

```bash
npm install -g vercel
vercel            # deploy pratinjau
vercel --prod     # deploy produksi
```

### Mengaktifkan Claude API (opsional)

Di Vercel: **Project → Settings → Environment Variables**, tambahkan lalu deploy ulang:

| Variabel | Wajib | Fungsi |
|---|---|---|
| `ANTHROPIC_API_KEY` | untuk mode live | API key Anthropic. Hanya dibaca di server, tidak pernah dikirim ke browser. |
| `APP_PASSWORD` | sangat disarankan | Kata sandi yang diminta sebelum sesi dimulai. Tanpa ini, siapa pun yang membuka URL bisa memakai kuota API Anda. |
| `ANTHROPIC_MODEL` | tidak | Model untuk semua agent. Bawaan: `claude-sonnet-4-5`. |
| `DEMO_MODE` | tidak | `true` memaksa mode demo walau API key terisi. |
| `VITE_DEMO_SPEED` | tidak | Kecepatan simulasi demo, dibaca saat build. Bawaan `1`. |

### Memakai penyedia selain Anthropic

Aplikasi juga bisa memakai penyedia apa pun yang kompatibel dengan OpenAI Chat Completions (OpenAI, OpenRouter, atau gateway pihak ketiga). Isi variabel ini sebagai ganti `ANTHROPIC_API_KEY`:

| Variabel | Isi |
|---|---|
| `OPENAI_API_KEY` | API key dari penyedia tersebut |
| `OPENAI_BASE_URL` | Base URL penyedia, tanpa `/chat/completions`. Contoh: `https://api.openai.com/v1` |
| `OPENAI_MODEL` | ID model persis seperti di daftar model penyedia |
| `LLM_PROVIDER` | Hanya bila kedua jenis key terisi: `anthropic` atau `openai` |

Syaratnya: model harus mendukung tool/function calling dan respons streaming. Key dari sebuah gateway hanya berlaku di base URL gateway itu; memakainya tanpa mengisi `OPENAI_BASE_URL` menghasilkan galat "API key is invalid". Nama model yang aktif tampil di lencana kiri atas.

## Menjalankan di komputer sendiri

Prasyarat: Node.js 20 atau lebih baru.

```bash
npm install
cp .env.example .env     # opsional
npm run dev
```

Buka http://localhost:5173. Di Mac, cukup klik ganda `Jalankan.command`. Fungsi `api/` ikut berjalan saat `npm run dev`, jadi mode live bisa dicoba lokal dengan mengisi `.env`.

## Cara kerjanya

```
Browser                                   Vercel
┌──────────────────────────────┐          ┌──────────────────────────┐
│ UI React + kantor 2D/3D      │          │ /api/health  (mode?)     │
│ Orkestrator (loop Azza +     │  POST    │ /api/claude  (Edge)      │──► Anthropic
│ agent spesialis, tool use)   │ ───────► │  + system prompt, tool,  │    atau penyedia
│ Mesin demo                   │ ◄─────── │    model, API key        │    kompatibel OpenAI
│ Penyimpanan sesi (browser)   │  stream  └──────────────────────────┘
└──────────────────────────────┘
```

- **Orkestrasi berjalan di browser.** Setiap giliran model adalah satu panggilan ke `/api/claude`. Fungsi itu menambahkan system prompt dan daftar tool milik agent yang diminta, lalu meneruskan respons streaming dari Anthropic. Klien hanya mengirim nama agent dan riwayat pesan, sehingga endpoint ini tidak bisa dipakai sebagai proxy Claude serbaguna.
- **Event real-time** (`agent_status_changed`, `activity_logged`, `task_assigned`, `artifact_created`, `decision_logged`, `roadmap_progress_updated`, `stats_updated`, dan lainnya) tetap sama, tetapi dipancarkan langsung di dalam browser, bukan lewat WebSocket. Fungsi serverless Vercel tidak bisa menahan koneksi WebSocket.
- **Penyimpanan** memakai `localStorage` browser: sesi terakhir tampil lagi setelah halaman dimuat ulang (tidak bisa dilanjutkan), dan riwayat tidak dibagi antar perangkat.
- **Tab harus tetap terbuka** selama sesi berjalan. Menutup atau memuat ulang tab menghentikan sesi.

## Tim agent

| Agent | Peran | Keluaran |
|---|---|---|
| ✨ Azza | Orkestrator · Lead System Analyst | Rencana, roadmap, delegasi (`ask_agent`), paket SRS akhir |
| 🌸 Anggrek | Business Analyst | Peta stakeholder, user story, BRD, prioritas MoSCoW |
| 🌼 Melati | Data & Process Modeler | DFD level 0/1/2, ERD, kamus data, normalisasi |
| 🌹 Mawar | UI/UX Analyst | User flow, wireframe low-fidelity, spesifikasi antarmuka |
| 🪻 Lavender | System Designer | Use case, sequence, activity, class diagram, spesifikasi fungsional |
| 🪷 Teratai | QA & Komunikasi | Matriks keterlacakan, checklist QA, ringkasan stakeholder |

Status agent: **Sedang bekerja**, **Istirahat** (otomatis saat tidak ada tugas), **Menunggu**.

## Cara pakai

- **Mulai**: tulis brief, klik *Mulai kerja tim*. Brief contoh "Sistem Informasi Perpustakaan Kampus" sudah terisi.
- **Menyela**: ketik di bar chat kapan saja, misalnya "tambahkan modul laporan". Azza menambah tugas ke roadmap dan mendelegasikannya.
- **Kantor**: tampilan bawaan adalah kantor isometrik 2D. Seret untuk menggeser, gulir untuk zoom, atau pilih preset kamera. Tombol *Tampilan 3D* mengganti ke scene Three.js; bila scene 3D gagal dimuat, aplikasi kembali ke 2D.
- **Aktivitas langsung**: 30 entri terbaru, bisa disaring per agent dan ditutup.
- **Tab kanan**: Roadmap, Keputusan, Output (pratinjau dan unduh `.md` / `.pdf` / `.png`), Bukti Validasi.
- **Mode ringkas**: otomatis di layar di bawah 1180 px, atau lewat tombol *Mode ringkas*.

## Struktur proyek

```
api/
  claude.ts            Fungsi Edge: proxy satu giliran model ke Anthropic (streaming)
  health.ts            Fungsi Edge: memberi tahu klien mode demo/live
src/
  App.tsx              Tata letak penuh dan mode ringkas
  store.ts             State Zustand + runtime sesi (mulai, sela, hentikan)
  shared/types.ts      Tipe event, state, dan definisi agent
  engine/
    session.ts         State sesi; setiap perubahan dipancarkan sebagai event
    live.ts            Orkestrasi Claude: loop Azza + loop agent spesialis
    claudeClient.ts    Klien /api/claude dan perakit respons streaming
    tools.ts           Definisi tool tiap agent
    provider.ts        Pemilihan penyedia model dari environment
    openaiAdapter.ts   Konversi format untuk penyedia kompatibel OpenAI
    prompts.ts         System prompt tiap agent (hanya dipakai di server)
    demo.ts            Mesin simulasi mode demo
    demo-content.ts    Konten artefak simulasi
    storage.ts         Penyimpanan sesi di browser
  components/          Header, feed aktivitas, panel tab, kartu agent, chat, pratinjau
  scene2d/             Kantor isometrik 2D (kanvas)
  scene/               Kantor 3D (Three.js)
  lib/                 Render Mermaid, ekspor md/pdf/png, format
```

## Batasan

- Mode live memakai token API berbayar; jumlahnya tampil di kartu "Token diproses".
- Riwayat percakapan Azza dikirim ulang di setiap giliran. Sesi yang sangat panjang bisa ditolak bila melewati 2 MB per permintaan.
- Ekspor PDF memakai font bawaan PDF, sehingga emoji dan sebagian simbol dihilangkan.
