@echo off
REM Uninstall Monster Super AI from Windows Startup

title Uninstall Monster Super AI from Startup
color 0C

echo.
echo ========================================================================
echo        Uninstall Monster Super AI from Windows Startup
echo ========================================================================
echo.

REM Get startup folder
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_FOLDER%\Monster Super AI.lnk"

REM Check if shortcut exists
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    if %errorlevel% equ 0 (
        echo SUCCESS: Monster Super AI removed from startup!
        echo.
        echo The voice assistant will no longer start automatically.
    ) else (
        echo ERROR: Failed to remove startup shortcut!
        echo Please delete it manually from: %STARTUP_FOLDER%
    )
) else (
    echo Monster Super AI is not in the startup folder.
    echo Nothing to remove.
)

echo.
pause
