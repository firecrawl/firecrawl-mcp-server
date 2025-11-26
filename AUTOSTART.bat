@echo off
cls
color 0A
title 🔥 MONSTER SUPER AI - RUNNING 🔥

REM Install dependencies if needed
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install --legacy-peer-deps >nul 2>&1
)

REM Start server and auto-open browser
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║          🔥 MONSTER SUPER AI - AUTO START 🔥             ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo ⚡ Starting server...

REM Start server in background
start /MIN cmd /c "node server-ultimate.js"

REM Wait for server
timeout /t 4 /nobreak >nul

REM Auto-open in default browser
start http://localhost:5001

echo.
echo ✅ SUCCESS! Monster AI is running!
echo.
echo 💻 Browser opened automatically
echo 📱 iPhone: Check your network IP in the server window
echo.
echo The server is running in a minimized window.
echo You can close this window - the server will keep running!
echo.
pause
