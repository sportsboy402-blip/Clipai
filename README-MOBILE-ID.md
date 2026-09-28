# ClipAI Mobile Ready
Tidak perlu install Node.js atau FFmpeg di HP. Server menjalankannya lewat Docker.

## Langkah dari HP
1. Download ZIP ini.
2. Buat repository baru di GitHub, misalnya `clipai`.
3. Upload semua isi ZIP ke repository.
4. Buka Render dan buat **New > Web Service**.
5. Hubungkan GitHub lalu pilih repository `clipai`.
6. Pilih **Language: Docker**, lalu Deploy.
7. Setelah selesai, buka URL `https://nama-service.onrender.com`.

Versi ini sudah bisa upload video dan membuat clip vertikal 9:16 dengan FFmpeg.
Integrasi AI transkrip + deteksi highlight + caption otomatis adalah tahap berikutnya.

Gunakan hanya video yang kamu miliki atau yang memang mengizinkan pengunduhan/pemrosesan.
