@echo off
cls
color 0A
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║          🔥 STARTING MONSTER SUPER AI BEAST 🔥           ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo ⚡ Server starting on http://localhost:5001
echo.
echo 🌐 Auto-opening browser in 3 seconds...
echo.

REM Start server in background briefly to allow browser open
start /B node server-ultimate.js

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM Auto-open browser
start http://localhost:5001

echo.
echo ✅ Browser opened! Monster AI is LIVE! 🔥
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Keep running (restart the node process in foreground for logs)
taskkill /F /IM node.exe >nul 2>&1
node server-ultimate.js
