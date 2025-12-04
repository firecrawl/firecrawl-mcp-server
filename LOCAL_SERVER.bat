@echo off
REM Monster Super AI - Local Server Launcher
REM Starts server and automatically opens browser
REM Built by Kings From Earth Development

title Monster Super AI - Local Server
color 0B
cls

echo.
echo ===============================================================================
echo.
echo                  *** MONSTER SUPER AI BEAST EDITION ***
echo                         Local Server Launcher
echo.
echo ===============================================================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] ERROR: Node.js is not installed!
    echo [!] Please run SETUP_WINDOWS.bat first
    echo.
    pause
    exit /b 1
)

REM Check if .env.ultimate exists
if not exist ".env.ultimate" (
    echo [!] WARNING: .env.ultimate file not found!
    echo [*] Creating from example...
    copy ".env.ultimate.example" ".env.ultimate" >nul
    echo [!] Please edit .env.ultimate and add your API keys
    echo [*] Opening .env.ultimate now...
    timeout /t 2 >nul
    notepad ".env.ultimate"
    echo.
    echo [*] After adding your API keys, run this script again
    pause
    exit /b 0
)

REM Kill any existing node processes on port 5001
echo [*] Checking for existing server instances...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001" ^| findstr "LISTENING"') do (
    echo [*] Killing existing process on port 5001 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM Get local IP address
echo [*] Detecting network configuration...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "LOCAL_IP=%%a"
    goto :ip_found
)
:ip_found
set LOCAL_IP=%LOCAL_IP: =%

echo [+] Server will be accessible at:
echo     - http://localhost:5001
if defined LOCAL_IP (
    echo     - http://%LOCAL_IP%:5001
)
echo.

REM Start the server in background
echo [*] Starting Monster Super AI server...
start /B node server-ultimate.js

REM Wait for server to start
echo [*] Waiting for server to initialize...
timeout /t 5 /nobreak >nul

REM Check if server started successfully
netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo [+] Server started successfully!
    echo.

    REM Open browser automatically
    echo [*] Opening browser...
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:5001/monster-ai-ultimate-v2.html"

    echo.
    echo ===============================================================================
    echo.
    echo                       *** SERVER IS RUNNING! ***
    echo.
    echo     Access Monster Super AI at: http://localhost:5001
    if defined LOCAL_IP (
        echo     Network access: http://%LOCAL_IP%:5001
        echo.
        echo     Share this URL with devices on your local network!
    )
    echo.
    echo     Browser opened automatically
    echo.
    echo     Press Ctrl+C to stop the server
    echo     Or close this window to stop the server
    echo.
    echo ===============================================================================
    echo.

    REM Keep the window open and show logs
    node server-ultimate.js
) else (
    echo [!] ERROR: Server failed to start!
    echo [*] Checking for errors...
    echo.
    node server-ultimate.js
    pause
    exit /b 1
)
