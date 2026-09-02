@echo off
title RideMate
echo Starting RideMate servers...

start "RideMate API" cmd /c "cd /d "%~dp0server" && node index.js"
timeout /t 2 /nobreak >nul
start "RideMate Client" cmd /c "cd /d "%~dp0client" && npx vite"

echo.
echo ==========================================
echo   RideMate is running!
echo   Frontend : http://localhost:5173
echo   API      : http://localhost:4000
echo ==========================================
echo.

timeout /t 3 /nobreak >nul
start http://localhost:5173
