# Monster Super AI - One-Click Advanced Deployment
# Interactive wizard for local and cloud deployment
# Built by Kings From Earth Development

param(
    [string]$Host = "",
    [string]$User = "",
    [int]$Port = 22,
    [string]$Path = "",
    [string]$Domain = ""
)

# Color output functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "     $Title" -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "[!] ERROR: $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[!] WARNING: $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Cyan
}

# Main deployment wizard
Write-Header "Monster Super AI - One-Click Deployment Wizard"

Write-Info "Welcome to the Monster Super AI deployment wizard!"
Write-Info "This script will guide you through deploying to Hostinger or setting up locally"
Write-Host ""

# Deployment type selection
Write-ColorOutput "Choose deployment type:" "Yellow"
Write-Host ""
Write-Host "  [1] Local Windows Setup - Configure for Windows 11"
Write-Host "  [2] Cloud Deployment - Deploy to Hostinger"
Write-Host "  [3] Both - Setup local and deploy to cloud"
Write-Host ""

$deployChoice = Read-Host "Enter your choice (1-3)"

if ($deployChoice -eq "1" -or $deployChoice -eq "3") {
    Write-Header "Local Windows Setup"

    # Check for Administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Warning "This script should be run as Administrator for full functionality"
        $continue = Read-Host "Continue anyway? (Y/N)"
        if ($continue -ne "Y" -and $continue -ne "y") {
            exit 0
        }
    }

    # Check Node.js
    Write-Info "Checking Node.js installation..."
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Success "Node.js is installed: $nodeVersion"
        } else {
            throw "Node.js not found"
        }
    } catch {
        Write-Warning "Node.js is not installed!"
        Write-Info "Downloading Node.js installer..."

        $nodeInstaller = "$env:TEMP\nodejs-installer.msi"
        $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"

        try {
            Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
            Write-Success "Downloaded Node.js installer"

            Write-Info "Installing Node.js... (This may take a few minutes)"
            Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait

            Write-Success "Node.js installation completed!"
            Write-Info "Please restart this script to continue"
            exit 0
        } catch {
            Write-Error "Failed to install Node.js: $_"
            Write-Info "Please download and install Node.js manually from: https://nodejs.org"
            exit 1
        }
    }

    # Install dependencies
    Write-Info "Installing npm dependencies..."
    try {
        npm install
        Write-Success "Dependencies installed successfully!"
    } catch {
        Write-Warning "Some dependencies may have failed to install"
        Write-Info "Attempting npm install --force..."
        npm install --force
    }

    # Configure firewall
    if ($isAdmin) {
        Write-Info "Configuring Windows Firewall..."
        try {
            & "$PSScriptRoot\configure-firewall.ps1"
            Write-Success "Firewall configured successfully!"
        } catch {
            Write-Warning "Firewall configuration failed: $_"
        }
    } else {
        Write-Warning "Skipping firewall configuration (requires Administrator)"
    }

    # Check .env.ultimate
    if (-not (Test-Path ".env.ultimate")) {
        Write-Info "Creating .env.ultimate from example..."
        Copy-Item ".env.ultimate.example" ".env.ultimate"
        Write-Warning "You need to add your API keys to .env.ultimate"

        $editNow = Read-Host "Edit .env.ultimate now? (Y/N)"
        if ($editNow -eq "Y" -or $editNow -eq "y") {
            notepad ".env.ultimate"
        }
    }

    # Create desktop shortcut
    Write-Info "Creating desktop shortcut..."
    try {
        $WScriptShell = New-Object -ComObject WScript.Shell
        $desktopPath = [Environment]::GetFolderPath("Desktop")
        $shortcutPath = Join-Path $desktopPath "Monster Super AI.lnk"

        $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = Join-Path $PSScriptRoot "START_BEAST.bat"
        $shortcut.WorkingDirectory = $PSScriptRoot
        $shortcut.Description = "Launch Monster Super AI BEAST Edition"
        $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
        $shortcut.Save()

        Write-Success "Desktop shortcut created!"
    } catch {
        Write-Warning "Failed to create desktop shortcut: $_"
    }

    # Setup startup (optional)
    $setupStartup = Read-Host "Enable auto-start on Windows boot? (Y/N)"
    if ($setupStartup -eq "Y" -or $setupStartup -eq "y") {
        if ($isAdmin) {
            Write-Info "Configuring Windows startup..."
            try {
                & "$PSScriptRoot\setup-startup.ps1"
                Write-Success "Startup configuration completed!"
            } catch {
                Write-Warning "Startup configuration failed: $_"
            }
        } else {
            Write-Warning "Auto-start setup requires Administrator privileges"
        }
    }

    Write-Header "Local Setup Complete!"
    Write-Success "Monster Super AI is ready to run on Windows 11!"
    Write-Info "Double-click 'Monster Super AI' on your desktop to start"
}

if ($deployChoice -eq "2" -or $deployChoice -eq "3") {
    Write-Header "Cloud Deployment to Hostinger"

    # Collect server information if not provided
    if (-not $Host) {
        $Host = Read-Host "Server hostname/IP (e.g., your-server.com)"
    }
    if (-not $User) {
        $User = Read-Host "SSH username"
    }
    if ($Port -eq 0 -or $Port -eq 22) {
        $portInput = Read-Host "SSH port (default 22)"
        if ($portInput) { $Port = [int]$portInput } else { $Port = 22 }
    }
    if (-not $Path) {
        $Path = Read-Host "Remote path (e.g., /home/user/monster-ai)"
    }
    if (-not $Domain) {
        $Domain = Read-Host "Your domain (e.g., supermonsterai.kingsfromearthdevelopment.com)"
    }

    Write-Host ""
    Write-Info "Deployment Configuration:"
    Write-Host "  Host: $Host"
    Write-Host "  User: $User"
    Write-Host "  Port: $Port"
    Write-Host "  Path: $Path"
    Write-Host "  Domain: $Domain"
    Write-Host ""

    $confirm = Read-Host "Is this correct? (Y/N)"
    if ($confirm -ne "Y" -and $confirm -ne "y") {
        Write-Info "Deployment cancelled"
        exit 0
    }

    # Check for SSH client
    Write-Info "Checking for SSH client..."
    $sshAvailable = Get-Command ssh -ErrorAction SilentlyContinue
    if (-not $sshAvailable) {
        Write-Warning "SSH client not found!"
        Write-Info "You can install OpenSSH via Windows Settings > Apps > Optional Features"
        Write-Info "Or use PuTTY/WinSCP for manual deployment"

        $manualDeploy = Read-Host "Create manual deployment package? (Y/N)"
        if ($manualDeploy -eq "Y" -or $manualDeploy -eq "y") {
            # Create deployment package
            Write-Info "Creating deployment package..."

            $deployPath = "$env:TEMP\monster-ai-deploy"
            if (Test-Path $deployPath) {
                Remove-Item -Path $deployPath -Recurse -Force
            }
            New-Item -Path $deployPath -ItemType Directory | Out-Null

            # Copy files
            Write-Info "Copying files..."
            Copy-Item "server-ultimate.js" $deployPath
            Copy-Item "package.json" $deployPath
            Copy-Item ".env.ultimate.example" $deployPath
            Copy-Item "monster-ai-ultimate-v2.html" $deployPath
            Copy-Item "deploy-hostinger.sh" $deployPath

            if (Test-Path "public") {
                Copy-Item "public" $deployPath -Recurse
            }

            # Create ZIP
            $zipPath = "$env:USERPROFILE\Desktop\monster-ai-deploy.zip"
            Write-Info "Creating ZIP file..."
            Compress-Archive -Path "$deployPath\*" -DestinationPath $zipPath -Force

            Write-Success "Deployment package created: $zipPath"
            Write-Info "Upload this ZIP to your Hostinger server and extract it"

            # Create instructions
            $instructions = @"
# Monster Super AI - Manual Deployment Instructions

## Server Details
Host: $Host
Port: $Port
User: $User
Path: $Path
Domain: $Domain

## Deployment Steps

1. Upload monster-ai-deploy.zip to your Hostinger server via cPanel File Manager
2. Extract the ZIP file to: $Path
3. Connect via SSH:
   ssh $User@$Host -p $Port

4. Navigate to project directory:
   cd $Path

5. Run deployment script:
   bash deploy-hostinger.sh

6. Edit environment file:
   nano .env.ultimate

7. Add your API keys to .env.ultimate:
   - LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
   - OPENAI_API_KEY
   - DEEPGRAM_API_KEY
   - CARTESIA_API_KEY
   - TAVILY_API_KEY
   - ANTHROPIC_API_KEY

8. Start the server:
   pm2 start server-ultimate.js --name monster-ai

9. Setup auto-start:
   pm2 startup
   pm2 save

10. Access your site:
    http://$Domain:5001
    https://$Domain (after SSL setup)

## SSL Certificate Setup

To enable HTTPS:

1. Install Certbot:
   sudo apt install certbot python3-certbot-nginx

2. Get SSL certificate:
   sudo certbot --nginx -d $Domain

3. Configure Nginx (see CLOUD_DEPLOYMENT.md for full config)

4. Restart Nginx:
   sudo systemctl restart nginx

## Troubleshooting

- Check server logs: pm2 logs monster-ai
- Restart server: pm2 restart monster-ai
- Stop server: pm2 stop monster-ai
- Check port: netstat -tulpn | grep 5001

For more help, see TROUBLESHOOTING.md
"@

            $instructions | Out-File "$env:USERPROFILE\Desktop\DEPLOYMENT_INSTRUCTIONS.txt"
            Write-Success "Instructions saved to Desktop\DEPLOYMENT_INSTRUCTIONS.txt"

            notepad "$env:USERPROFILE\Desktop\DEPLOYMENT_INSTRUCTIONS.txt"
        }
        exit 0
    }

    # Automatic deployment with SSH
    Write-Info "Preparing automatic deployment..."

    # Test SSH connection
    Write-Info "Testing SSH connection..."
    $testConnection = ssh -p $Port -o ConnectTimeout=10 -o BatchMode=yes "$User@$Host" "echo 'Connection successful'" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not connect to server automatically"
        Write-Info "You may need to:"
        Write-Host "  1. Add your SSH key to the server"
        Write-Host "  2. Or use password authentication (will prompt)"
        Write-Host ""

        $continueManual = Read-Host "Continue with manual authentication? (Y/N)"
        if ($continueManual -ne "Y" -and $continueManual -ne "y") {
            exit 0
        }
    } else {
        Write-Success "SSH connection successful!"
    }

    # Upload files
    Write-Info "Uploading files to server..."

    # Create remote directory
    ssh -p $Port "$User@$Host" "mkdir -p $Path"

    # Upload files using SCP
    $filesToUpload = @(
        "server-ultimate.js",
        "package.json",
        ".env.ultimate.example",
        "monster-ai-ultimate-v2.html",
        "deploy-hostinger.sh"
    )

    foreach ($file in $filesToUpload) {
        if (Test-Path $file) {
            Write-Info "Uploading $file..."
            scp -P $Port $file "$User@$Host`:$Path/"
            if ($LASTEXITCODE -eq 0) {
                Write-Success "$file uploaded"
            } else {
                Write-Warning "Failed to upload $file"
            }
        }
    }

    # Upload public folder if exists
    if (Test-Path "public") {
        Write-Info "Uploading public folder..."
        scp -P $Port -r public "$User@$Host`:$Path/"
    }

    Write-Success "All files uploaded!"

    # Run deployment script on server
    Write-Info "Running deployment script on server..."

    $deployCommands = @"
cd $Path && \
chmod +x deploy-hostinger.sh && \
bash deploy-hostinger.sh
"@

    ssh -p $Port "$User@$Host" $deployCommands

    Write-Header "Cloud Deployment Complete!"

    Write-Success "Monster Super AI has been deployed to Hostinger!"
    Write-Host ""
    Write-Info "Next Steps:"
    Write-Host "  1. SSH into your server: ssh $User@$Host -p $Port"
    Write-Host "  2. Navigate to: cd $Path"
    Write-Host "  3. Edit .env.ultimate with your API keys: nano .env.ultimate"
    Write-Host "  4. Start the server: pm2 start server-ultimate.js --name monster-ai"
    Write-Host "  5. Access your site: http://$Domain:5001"
    Write-Host ""
    Write-Info "For SSL setup and domain configuration, see CLOUD_DEPLOYMENT.md"
}

Write-Header "Deployment Wizard Complete!"

Write-Success "All tasks completed successfully!"
Write-Host ""
Write-Info "What's Next?"
Write-Host ""

if ($deployChoice -eq "1" -or $deployChoice -eq "3") {
    Write-Host "  Local Setup:"
    Write-Host "    - Double-click 'Monster Super AI' on your desktop"
    Write-Host "    - Or run START_BEAST.bat"
    Write-Host "    - Access at: http://localhost:5001"
    Write-Host ""
}

if ($deployChoice -eq "2" -or $deployChoice -eq "3") {
    Write-Host "  Cloud Access:"
    Write-Host "    - Complete API key configuration on server"
    Write-Host "    - Access at: http://$Domain:5001"
    Write-Host "    - Setup SSL for HTTPS access"
    Write-Host ""
}

Write-Host "  Documentation:"
Write-Host "    - WINDOWS_SETUP.md - Local setup guide"
Write-Host "    - CLOUD_DEPLOYMENT.md - Cloud deployment guide"
Write-Host "    - TROUBLESHOOTING.md - Common issues"
Write-Host ""

$startNow = Read-Host "Start local server now? (Y/N)"
if ($startNow -eq "Y" -or $startNow -eq "y") {
    Write-Info "Starting Monster Super AI..."
    Start-Process "LOCAL_SERVER.bat"
}

Write-Host ""
Write-ColorOutput "Thank you for using Monster Super AI BEAST Edition!" "Green"
Write-ColorOutput "Built by Kings From Earth Development" "Cyan"
Write-Host ""

exit 0
