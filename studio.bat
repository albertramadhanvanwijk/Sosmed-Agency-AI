@echo off
REM ===========================================================================
REM  PropDesk AI - Studio
REM  Menjalankan dashboard dan membuka peramban otomatis.
REM ===========================================================================

cd /d "%~dp0"

echo.
echo   PropDesk AI - Studio
echo   ====================
echo.

if not exist ".env.local" (
  echo   PERHATIAN: berkas .env.local belum ada.
  echo   Salin .env.local.example menjadi .env.local lalu isi kunci 9Router,
  echo   jika tidak, produksi carousel tidak akan berjalan.
  echo.
)

if not exist "node_modules" (
  echo   Memasang dependensi untuk pertama kali...
  call npm install --no-audit --no-fund
  echo.
)

echo   Membuka http://127.0.0.1:4321
start "" http://127.0.0.1:4321

call node packages\studio\server.ts
