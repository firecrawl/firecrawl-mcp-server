@echo off
REM Monster Super AI BEAST Edition - Windows 11 Setup
REM One-Click Installation Script
REM Built by Kings From Earth Development

title Monster Super AI - Windows Setup Wizard
color 0B
cls

echo.
echo ===============================================================================
echo.
echo                  *** MONSTER SUPER AI BEAST EDITION ***
echo                         Windows 11 Setup Wizard
echo.
echo                   Built by Kings From Earth Development
echo.
echo ===============================================================================
echo.
echo [*] Starting automated installation...
echo.

REM Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] ERROR: This script requires Administrator privileges!
    echo [!] Please right-click and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo [+] Administrator privileges confirmed
echo.

REM Step 1: Check if Node.js is installed
echo [1/8] Checking Node.js installation...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js not found! Installing Node.js...
    echo [*] This will download and install Node.js LTS...

    REM Download Node.js installer
    powershell -Command "& {Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs-installer.msi'}"

    if exist "%TEMP%\nodejs-installer.msi" (
        echo [*] Installing Node.js... (This may take a few minutes)
        msiexec /i "%TEMP%\nodejs-installer.msi" /quiet /norestart

        REM Wait for installation to complete
        timeout /t 30 /nobreak >nul

        REM Refresh environment variables
        call refreshenv.cmd >nul 2>&1

        echo [+] Node.js installation completed!
        echo [*] You may need to restart this script after installation
    ) else (
        echo [!] ERROR: Failed to download Node.js installer
        echo [!] Please download and install Node.js manually from: https://nodejs.org
        pause
        exit /b 1
    )
) else (
    echo [+] Node.js is already installed
    node --version
)
echo.

REM Step 2: Check npm
echo [2/8] Verifying npm installation...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] ERROR: npm not found! Please restart your computer and try again.
    pause
    exit /b 1
)
echo [+] npm is available
npm --version
echo.

REM Step 3: Install Dependencies
echo [3/8] Installing npm dependencies...
echo [*] This may take 2-3 minutes...
call npm install
if %errorLevel% neq 0 (
    echo [!] Warning: Some dependencies may have failed to install
    echo [*] Attempting to fix with npm install --force...
    call npm install --force
)
echo [+] Dependencies installed successfully!
echo.

REM Step 4: Configure Windows Firewall
echo [4/8] Configuring Windows Firewall for port 5001...
powershell -ExecutionPolicy Bypass -File "%~dp0configure-firewall.ps1"
if %errorLevel% equ 0 (
    echo [+] Firewall rules configured successfully!
) else (
    echo [!] Warning: Firewall configuration may have failed
    echo [*] You may need to manually allow port 5001 in Windows Firewall
)
echo.

REM Step 5: Create .env.ultimate if it doesn't exist
echo [5/8] Checking environment configuration...
if not exist ".env.ultimate" (
    echo [*] Creating .env.ultimate from example...
    copy ".env.ultimate.example" ".env.ultimate" >nul
    echo [!] IMPORTANT: You need to add your API keys to .env.ultimate
    echo [*] Opening .env.ultimate in notepad...
    timeout /t 2 >nul
    notepad ".env.ultimate"
) else (
    echo [+] .env.ultimate already exists
)
echo.

REM Step 6: Create Desktop Shortcut
echo [6/8] Creating desktop shortcut...
powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%USERPROFILE%\Desktop\Monster Super AI.lnk'); $SC.TargetPath = '%~dp0START_BEAST.bat'; $SC.WorkingDirectory = '%~dp0'; $SC.IconLocation = '%SystemRoot%\System32\shell32.dll,13'; $SC.Description = 'Launch Monster Super AI BEAST Edition'; $SC.Save()"
if exist "%USERPROFILE%\Desktop\Monster Super AI.lnk" (
    echo [+] Desktop shortcut created successfully!
) else (
    echo [!] Warning: Failed to create desktop shortcut
)
echo.

REM Step 7: Setup Windows Startup (Optional)
echo [7/8] Windows Startup Configuration
echo.
echo Would you like Monster Super AI to start automatically when Windows boots?
echo [Y] Yes - Auto-start on boot
echo [N] No - Manual start only
echo.
choice /C YN /N /M "Your choice: "
if %errorLevel% equ 1 (
    echo [*] Configuring Windows startup...
    powershell -ExecutionPolicy Bypass -File "%~dp0setup-startup.ps1"
    if %errorLevel% equ 0 (
        echo [+] Startup configuration completed!
    ) else (
        echo [!] Warning: Startup configuration may have failed
    )
) else (
    echo [*] Skipping startup configuration
)
echo.

REM Step 8: Test Server Start
echo [8/8] Testing server startup...
echo [*] Starting server for test... (Will auto-close in 10 seconds)
echo.
start /B node server-ultimate.js
timeout /t 10 /nobreak
taskkill /F /IM node.exe >nul 2>&1
echo [+] Server test completed!
echo.

REM Final Success Message
cls
color 0A
echo.
echo ===============================================================================
echo.
echo                         *** SETUP COMPLETED! ***
echo.
echo                  Monster Super AI BEAST Edition is ready!
echo.
echo ===============================================================================
echo.
echo [+] Installation Summary:
echo     - Node.js and npm installed/verified
echo     - All dependencies installed
echo     - Windows Firewall configured for port 5001
echo     - Desktop shortcut created
echo     - Environment variables configured
echo.
echo [*] Next Steps:
echo.
echo     1. Edit .env.ultimate and add your API keys:
echo        - LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
echo        - OPENAI_API_KEY
echo        - DEEPGRAM_API_KEY
echo        - CARTESIA_API_KEY
echo        - TAVILY_API_KEY
echo        - ANTHROPIC_API_KEY
echo.
echo     2. Double-click "Monster Super AI" on your desktop to start!
echo.
echo     3. Or run START_BEAST.bat from this folder
echo.
echo     4. Server will be available at:
echo        - http://localhost:5001
echo        - http://[YOUR-IP]:5001 (for network access)
echo.
echo     5. To deploy to cloud, run DEPLOY_TO_CLOUD.bat
echo.
echo ===============================================================================
echo.
echo [?] Would you like to start the server now?
echo.
choice /C YN /N /M "[Y] Yes - Start now    [N] No - Exit: "
if %errorLevel% equ 1 (
    echo.
    echo [*] Starting Monster Super AI...
    start "" "%~dp0START_BEAST.bat"
)

echo.
echo Thank you for using Monster Super AI BEAST Edition!
echo Built by Kings From Earth Development
echo.
timeout /t 5
exit /b 0
