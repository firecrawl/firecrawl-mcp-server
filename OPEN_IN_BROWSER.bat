@echo off
REM Monster Super AI - Browser Launcher
REM Quickly opens Monster Super AI in your default browser
REM Built by Kings From Earth Development

title Monster Super AI - Browser Launcher
color 0B

echo.
echo ===============================================================================
echo.
echo              Opening Monster Super AI in your browser...
echo.
echo ===============================================================================
echo.

REM Check if server is running
netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] WARNING: Server is not running on port 5001!
    echo.
    echo [?] Would you like to start the server now?
    echo.
    choice /C YN /N /M "[Y] Yes - Start server    [N] No - Exit: "
    if %errorLevel% equ 1 (
        echo.
        echo [*] Starting server...
        start "" "%~dp0LOCAL_SERVER.bat"
        timeout /t 5
    ) else (
        echo [*] Exiting...
        timeout /t 2
        exit /b 0
    )
)

echo [*] Server detected on port 5001
echo [*] Opening browser...
echo.

REM Try different URLs
start "" "http://localhost:5001/monster-ai-ultimate-v2.html"
timeout /t 1 /nobreak >nul

echo [+] Browser opened!
echo.
echo [*] If the page doesn't load, the server may still be starting
echo [*] Try refreshing the page in a few seconds
echo.
timeout /t 3
exit /b 0
