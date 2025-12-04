@echo off
REM Monster Super AI - Cloud Deployment Script
REM Automated deployment to Hostinger
REM Built by Kings From Earth Development

title Monster Super AI - Cloud Deployment
color 0D
cls

echo.
echo ===============================================================================
echo.
echo                  *** MONSTER SUPER AI BEAST EDITION ***
echo                        Cloud Deployment to Hostinger
echo.
echo ===============================================================================
echo.
echo [*] This script will deploy Monster Super AI to your Hostinger server
echo.

REM Check for required tools
echo [1/3] Checking prerequisites...
echo.

REM Check if WinSCP is installed (for SFTP)
where winscp >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] WinSCP not found!
    echo [*] For best experience, install WinSCP from: https://winscp.net
    echo [*] Or use the PowerShell deployment method
    echo.
    echo [?] Continue with PowerShell method?
    choice /C YN /N /M "[Y] Yes    [N] No: "
    if %errorLevel% equ 2 exit /b 0
    set USE_POWERSHELL=1
) else (
    set USE_POWERSHELL=0
    echo [+] WinSCP found
)
echo.

REM Check if plink is available (for SSH)
where plink >nul 2>&1
if %errorLevel% neq 0 (
    where ssh >nul 2>&1
    if %errorLevel% neq 0 (
        echo [!] Neither plink nor ssh found!
        echo [*] Will use manual deployment mode
        set USE_SSH=0
    ) else (
        echo [+] SSH client found
        set USE_SSH=1
        set SSH_CMD=ssh
    )
) else (
    echo [+] PuTTY plink found
    set USE_SSH=1
    set SSH_CMD=plink
)
echo.

echo [2/3] Collecting deployment information...
echo.

REM Collect Hostinger credentials
echo ===============================================================================
echo                     Hostinger Server Information
echo ===============================================================================
echo.
echo Please enter your Hostinger server details:
echo.

set /p HOSTINGER_HOST="Server hostname/IP (e.g., your-server.com): "
set /p HOSTINGER_USER="SSH username: "
set /p HOSTINGER_PORT="SSH port (default 22): "
if "%HOSTINGER_PORT%"=="" set HOSTINGER_PORT=22

set /p HOSTINGER_PATH="Remote path (e.g., /home/user/monster-ai): "
set /p DOMAIN_NAME="Your domain (e.g., supermonsterai.kingsfromearthdevelopment.com): "

echo.
echo [*] Server: %HOSTINGER_HOST%
echo [*] User: %HOSTINGER_USER%
echo [*] Port: %HOSTINGER_PORT%
echo [*] Path: %HOSTINGER_PATH%
echo [*] Domain: %DOMAIN_NAME%
echo.
echo [?] Is this information correct?
choice /C YN /N /M "[Y] Yes - Continue    [N] No - Exit: "
if %errorLevel% equ 2 exit /b 0

echo.
echo [3/3] Starting deployment...
echo.

REM Create deployment package
echo [*] Creating deployment package...
if exist "%TEMP%\monster-ai-deploy" rmdir /S /Q "%TEMP%\monster-ai-deploy"
mkdir "%TEMP%\monster-ai-deploy"

REM Copy necessary files
echo [*] Copying files...
copy "server-ultimate.js" "%TEMP%\monster-ai-deploy\" >nul
copy "package.json" "%TEMP%\monster-ai-deploy\" >nul
copy ".env.ultimate.example" "%TEMP%\monster-ai-deploy\" >nul
copy "monster-ai-ultimate-v2.html" "%TEMP%\monster-ai-deploy\" >nul
copy "deploy-hostinger.sh" "%TEMP%\monster-ai-deploy\" >nul

REM Copy public folder if exists
if exist "public" (
    xcopy "public" "%TEMP%\monster-ai-deploy\public\" /E /I /Q >nul
)

echo [+] Deployment package created
echo.

REM Create deployment instructions file
echo [*] Creating deployment instructions...
(
echo # Monster Super AI - Hostinger Deployment
echo.
echo ## Server Details
echo Host: %HOSTINGER_HOST%
echo Port: %HOSTINGER_PORT%
echo Path: %HOSTINGER_PATH%
echo Domain: %DOMAIN_NAME%
echo.
echo ## Deployment Steps
echo.
echo 1. Upload files to server
echo 2. SSH into server: ssh %HOSTINGER_USER%@%HOSTINGER_HOST% -p %HOSTINGER_PORT%
echo 3. Navigate to: cd %HOSTINGER_PATH%
echo 4. Run deployment script: bash deploy-hostinger.sh
echo 5. Configure environment: nano .env.ultimate
echo 6. Add your API keys to .env.ultimate
echo 7. Start server: pm2 start server-ultimate.js --name monster-ai
echo 8. Setup auto-start: pm2 startup
echo 9. Save PM2 config: pm2 save
echo.
echo ## Access Your Site
echo http://%DOMAIN_NAME%:5001
echo https://%DOMAIN_NAME% ^(after SSL setup^)
echo.
) > "%TEMP%\monster-ai-deploy\DEPLOYMENT_INSTRUCTIONS.txt"

echo [+] Instructions created
echo.

REM Advanced deployment with PowerShell
echo ===============================================================================
echo                     Deployment Method Selection
echo ===============================================================================
echo.
echo Choose your deployment method:
echo.
echo [1] Automatic - Upload and configure via SSH (requires SSH access)
echo [2] Semi-Automatic - Generate upload commands only
echo [3] Manual - Create ZIP file for manual upload via cPanel
echo.
choice /C 123 /N /M "Your choice: "
set DEPLOY_METHOD=%errorLevel%

echo.

if %DEPLOY_METHOD%==1 (
    REM Automatic deployment
    echo [*] Starting automatic deployment...
    echo [*] This will use PowerShell to upload files and configure the server
    echo.

    if exist "%~dp0one-click-deploy.ps1" (
        powershell -ExecutionPolicy Bypass -File "%~dp0one-click-deploy.ps1" -Host "%HOSTINGER_HOST%" -User "%HOSTINGER_USER%" -Port "%HOSTINGER_PORT%" -Path "%HOSTINGER_PATH%" -Domain "%DOMAIN_NAME%"
    ) else (
        echo [!] ERROR: one-click-deploy.ps1 not found!
        echo [*] Falling back to manual deployment...
        set DEPLOY_METHOD=3
    )
)

if %DEPLOY_METHOD%==2 (
    REM Semi-automatic deployment
    echo [*] Generating upload commands...
    echo.

    (
        echo # Monster Super AI - Upload Commands
        echo # Copy and paste these commands in your terminal
        echo.
        echo # Upload files via SCP
        echo scp -P %HOSTINGER_PORT% -r "%TEMP%\monster-ai-deploy\*" %HOSTINGER_USER%@%HOSTINGER_HOST%:%HOSTINGER_PATH%/
        echo.
        echo # SSH into server
        echo ssh %HOSTINGER_USER%@%HOSTINGER_HOST% -p %HOSTINGER_PORT%
        echo.
        echo # Once connected, run:
        echo cd %HOSTINGER_PATH%
        echo bash deploy-hostinger.sh
        echo.
    ) > "%TEMP%\monster-ai-deploy\UPLOAD_COMMANDS.txt"

    echo [+] Upload commands saved to: %TEMP%\monster-ai-deploy\UPLOAD_COMMANDS.txt
    echo.
    notepad "%TEMP%\monster-ai-deploy\UPLOAD_COMMANDS.txt"
)

if %DEPLOY_METHOD%==3 (
    REM Manual deployment - create ZIP
    echo [*] Creating ZIP file for manual upload...
    echo.

    powershell -Command "Compress-Archive -Path '%TEMP%\monster-ai-deploy\*' -DestinationPath '%USERPROFILE%\Desktop\monster-ai-deploy.zip' -Force"

    if exist "%USERPROFILE%\Desktop\monster-ai-deploy.zip" (
        echo [+] Deployment ZIP created on your Desktop!
        echo.
        echo [*] Manual Deployment Steps:
        echo     1. Upload monster-ai-deploy.zip to your Hostinger server via cPanel File Manager
        echo     2. Extract the ZIP file
        echo     3. Connect via SSH terminal
        echo     4. Run: cd %HOSTINGER_PATH% ^&^& bash deploy-hostinger.sh
        echo     5. Edit .env.ultimate with your API keys
        echo     6. Start server with PM2
        echo.
        echo [*] Opening instructions file...
        timeout /t 2 >nul
        notepad "%TEMP%\monster-ai-deploy\DEPLOYMENT_INSTRUCTIONS.txt"
    ) else (
        echo [!] ERROR: Failed to create ZIP file
        exit /b 1
    )
)

echo.
echo ===============================================================================
echo.
echo                     *** DEPLOYMENT PREPARED! ***
echo.
echo ===============================================================================
echo.
echo [+] Next Steps:
echo.
echo     1. Follow the instructions in DEPLOYMENT_INSTRUCTIONS.txt
echo     2. Upload files to your Hostinger server
echo     3. Run the deployment script on the server
echo     4. Configure your .env.ultimate file with API keys
echo     5. Access your site at: http://%DOMAIN_NAME%:5001
echo.
echo [*] For detailed instructions, see CLOUD_DEPLOYMENT.md
echo.
echo ===============================================================================
echo.
echo [?] Would you like to open the Cloud Deployment Guide?
choice /C YN /N /M "[Y] Yes    [N] No: "
if %errorLevel% equ 1 (
    if exist "%~dp0CLOUD_DEPLOYMENT.md" (
        notepad "%~dp0CLOUD_DEPLOYMENT.md"
    )
)

echo.
echo Thank you for using Monster Super AI BEAST Edition!
echo Built by Kings From Earth Development
echo.
timeout /t 5
exit /b 0
