#!/bin/zsh
# Peluncur lokal: klik ganda file ini untuk menjalankan aplikasi di komputer sendiri.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
echo ""
echo "=== Ruang Kerja Tim Analis Sistem ==="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Unduh versi LTS dari https://nodejs.org lalu jalankan file ini lagi."
  open "https://nodejs.org"; read "?Tekan Enter untuk menutup."; exit 1
fi
echo "Node.js $(node -v)"
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=20?0:1)'; then
  echo "Versi Node.js terlalu lama. Butuh versi 20 atau lebih baru: https://nodejs.org"
  open "https://nodejs.org"; read "?Tekan Enter untuk menutup."; exit 1
fi
if [ ! -d node_modules ]; then
  echo "Memasang dependensi (sekali saja, beberapa menit)..."
  if ! npm install; then
    echo ""; echo "npm install gagal. Salin teks di atas dan kirim ke Claude."
    read "?Tekan Enter untuk menutup."; exit 1
  fi
fi
echo "Menjalankan aplikasi. Browser terbuka otomatis; biarkan jendela ini tetap terbuka."
echo "Untuk berhenti: tekan Ctrl + C."
(sleep 5 && open "http://localhost:5173") &
npm run dev
echo ""
read "?Aplikasi berhenti. Salin teks di atas bila ada galat. Tekan Enter untuk menutup."
