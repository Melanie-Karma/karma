@echo off
chcp 65001 >nul
title Karma lokal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte die LTS-Version von https://nodejs.org installieren und dieses Fenster neu starten.
  pause
  exit /b 1
)

if not exist .env.local (
  echo NEXT_PUBLIC_SUPABASE_URL=https://zthhyfjsmlchssadhtbn.supabase.co> .env.local
  echo NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_mjFCcmUAvPAMe0tIPu8IgQ_wKMwm8y1>> .env.local
)

if not exist node_modules (
  echo Erster Start: Pakete werden installiert, das dauert ein paar Minuten ...
  call npm install
  if errorlevel 1 (
    echo Installation hat nicht geklappt.
    pause
    exit /b 1
  )
)

echo.
echo Karma startet. Der Browser oeffnet sich gleich mit http://localhost:3000
echo Dieses Fenster offen lassen. Zum Beenden einfach schliessen.
echo.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
pause
