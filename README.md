# Germann — Game Belajar Bahasa Jerman

Sederhana: game kuis kosakata Jerman ↔ Inggris.

Cara pakai (Windows + XAMPP):

1. Pastikan XAMPP sedang berjalan (Apache aktif).
2. Letakkan folder `germann` di `c:\xampp\htdocs\` (sudah dibuat otomatis oleh skrip ini).
3. Buka browser dan kunjungi: `http://localhost/germann/` atau `http://127.0.0.1/germann/`
4. Klik "Mulai" lalu pilih jawaban yang benar. Skor akan muncul di pojok.

File penting:
- `index.html` — halaman utama.
- `styles.css` — styling.
- `script.js` — logika game.
- `data.json` — data kosakata (ubah/luaskan sesuai kebutuhan).

Catatan:
- Jika `data.json` tidak termuat, pastikan file ada dan Anda membuka lewat server (http), bukan file://.
- Anda bisa menambahkan kosakata di `data.json` dengan format: {"de":"...","en":"..."}.
