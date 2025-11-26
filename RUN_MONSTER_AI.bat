@echo off
cls
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║       🔥 MONSTER SUPER AI - AUTO LAUNCHER 🔥             ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Starting server...
echo.

REM Start the server in background
start /B node server-ultimate.js

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP:~1%

echo.
echo ✅ Server is running!
echo.
echo 🌐 Opening Monster AI in your browser...
echo.
echo 📱 Access from iPhone: http://%IP%:5001
echo 💻 Access from PC: http://localhost:5001
echo.

REM Auto-open browser
timeout /t 2 /nobreak >nul
start http://localhost:5001

echo.
echo 🔥 Monster Super AI is LIVE! 🔥
echo.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
pause
