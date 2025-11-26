@echo off
REM Install Monster Super AI to Windows Startup
REM This creates a shortcut in the Startup folder

title Install Monster Super AI to Startup
color 0E

echo.
echo ========================================================================
echo           Install Monster Super AI to Windows Startup
echo ========================================================================
echo.

REM Get the current directory
set "SCRIPT_DIR=%~dp0"
set "STARTUP_BAT=%SCRIPT_DIR%start-voice-assistant.bat"

REM Check if the startup script exists
if not exist "%STARTUP_BAT%" (
    echo ERROR: start-voice-assistant.bat not found!
    echo Please ensure you are running this from the correct directory.
    echo.
    pause
    exit /b 1
)

REM Create VBS script to create shortcut
set "VBS_SCRIPT=%TEMP%\create_startup_shortcut.vbs"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = oWS.SpecialFolders("Startup") ^& "\Monster Super AI.lnk" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%STARTUP_BAT%" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> "%VBS_SCRIPT%"
echo oLink.Description = "Monster Super AI Voice Assistant" >> "%VBS_SCRIPT%"
echo oLink.WindowStyle = 1 >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

REM Execute VBS script
cscript //nologo "%VBS_SCRIPT%"

if %errorlevel% equ 0 (
    echo.
    echo ========================================================================
    echo                         SUCCESS!
    echo ========================================================================
    echo.
    echo Monster Super AI has been added to Windows Startup!
    echo.
    echo The voice assistant will now automatically start when you log in.
    echo.
    echo Location: %USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
    echo.
    echo To remove: Delete the "Monster Super AI" shortcut from the Startup folder
    echo.
) else (
    echo.
    echo ERROR: Failed to create startup shortcut!
    echo.
)

REM Cleanup
del "%VBS_SCRIPT%" >nul 2>&1

echo.
pause
