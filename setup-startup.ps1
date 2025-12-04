# Monster Super AI - Windows Startup Configuration
# Configures Monster Super AI to auto-start on Windows boot
# Built by Kings From Earth Development

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     Monster Super AI - Startup Configuration" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[!] ERROR: This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "[!] Please run PowerShell as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Administrator privileges confirmed" -ForegroundColor Green
Write-Host ""

# Get the current script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$startBeastPath = Join-Path $scriptPath "START_BEAST.bat"

if (-not (Test-Path $startBeastPath)) {
    Write-Host "[!] ERROR: START_BEAST.bat not found at: $startBeastPath" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Found START_BEAST.bat at: $startBeastPath" -ForegroundColor Green
Write-Host ""

# Method 1: Create Startup Folder Shortcut
Write-Host "[1/2] Creating startup folder shortcut..." -ForegroundColor Cyan
try {
    $startupFolder = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupFolder "Monster Super AI.lnk"

    $WScriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $startBeastPath
    $shortcut.WorkingDirectory = $scriptPath
    $shortcut.Description = "Monster Super AI BEAST Edition - Auto-start"
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
    $shortcut.WindowStyle = 7  # Minimized
    $shortcut.Save()

    Write-Host "[+] Startup shortcut created at: $shortcutPath" -ForegroundColor Green
} catch {
    Write-Host "[!] ERROR: Failed to create startup shortcut: $_" -ForegroundColor Red
}
Write-Host ""

# Method 2: Create Scheduled Task (more reliable)
Write-Host "[2/2] Creating scheduled task..." -ForegroundColor Cyan
try {
    # Remove existing task if it exists
    $taskName = "MonsterSuperAI_AutoStart"
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "[*] Removing existing scheduled task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Create new scheduled task
    $action = New-ScheduledTaskAction -Execute $startBeastPath -WorkingDirectory $scriptPath
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    # Delay startup by 30 seconds to allow system to fully boot
    $trigger.Delay = "PT30S"

    Register-ScheduledTask -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description "Auto-starts Monster Super AI BEAST Edition on system boot" `
        -Force

    Write-Host "[+] Scheduled task created successfully" -ForegroundColor Green
    Write-Host "[*] Task name: $taskName" -ForegroundColor Cyan
    Write-Host "[*] Will start 30 seconds after login" -ForegroundColor Cyan
} catch {
    Write-Host "[!] ERROR: Failed to create scheduled task: $_" -ForegroundColor Red
    Write-Host "[*] The startup shortcut will still work" -ForegroundColor Yellow
}
Write-Host ""

# Display summary
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     Startup Configuration Summary" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[+] Monster Super AI will now start automatically when you log in" -ForegroundColor Green
Write-Host ""
Write-Host "[*] Startup methods configured:" -ForegroundColor Cyan
Write-Host "    1. Startup folder shortcut (immediate)" -ForegroundColor Gray
Write-Host "    2. Scheduled task (30 second delay)" -ForegroundColor Gray
Write-Host ""
Write-Host "[*] To disable auto-start:" -ForegroundColor Yellow
Write-Host "    - Delete shortcut from: $([Environment]::GetFolderPath('Startup'))" -ForegroundColor Gray
Write-Host "    - Or run: Unregister-ScheduledTask -TaskName 'MonsterSuperAI_AutoStart'" -ForegroundColor Gray
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[+] Configuration completed successfully!" -ForegroundColor Green
Write-Host ""

exit 0
