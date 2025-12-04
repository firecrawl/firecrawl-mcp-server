# Monster Super AI - Windows Firewall Configuration
# Automatically configures firewall rules for port 5001
# Built by Kings From Earth Development

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     Monster Super AI - Firewall Configuration" -ForegroundColor Yellow
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

# Remove existing rules (if any)
Write-Host "[1/4] Removing existing Monster AI firewall rules..." -ForegroundColor Cyan
try {
    Remove-NetFirewallRule -DisplayName "Monster Super AI - TCP In" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "Monster Super AI - TCP Out" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "Monster Super AI - UDP In" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "Monster Super AI - UDP Out" -ErrorAction SilentlyContinue
    Write-Host "[+] Existing rules cleaned up" -ForegroundColor Green
} catch {
    Write-Host "[*] No existing rules to remove" -ForegroundColor Yellow
}
Write-Host ""

# Create TCP Inbound Rule
Write-Host "[2/4] Creating TCP inbound rule for port 5001..." -ForegroundColor Cyan
try {
    New-NetFirewallRule -DisplayName "Monster Super AI - TCP In" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 5001 `
        -Action Allow `
        -Profile Any `
        -Description "Allows inbound TCP connections to Monster Super AI on port 5001" `
        -Enabled True
    Write-Host "[+] TCP inbound rule created successfully" -ForegroundColor Green
} catch {
    Write-Host "[!] ERROR: Failed to create TCP inbound rule: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Create TCP Outbound Rule
Write-Host "[3/4] Creating TCP outbound rule for port 5001..." -ForegroundColor Cyan
try {
    New-NetFirewallRule -DisplayName "Monster Super AI - TCP Out" `
        -Direction Outbound `
        -Protocol TCP `
        -LocalPort 5001 `
        -Action Allow `
        -Profile Any `
        -Description "Allows outbound TCP connections from Monster Super AI on port 5001" `
        -Enabled True
    Write-Host "[+] TCP outbound rule created successfully" -ForegroundColor Green
} catch {
    Write-Host "[!] ERROR: Failed to create TCP outbound rule: $_" -ForegroundColor Red
}
Write-Host ""

# Create Node.js executable rule
Write-Host "[4/4] Creating Node.js program rule..." -ForegroundColor Cyan
try {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Path
    if ($nodePath) {
        New-NetFirewallRule -DisplayName "Monster Super AI - Node.js" `
            -Direction Inbound `
            -Program $nodePath `
            -Action Allow `
            -Profile Any `
            -Description "Allows Node.js to accept incoming connections for Monster Super AI" `
            -Enabled True
        Write-Host "[+] Node.js program rule created successfully" -ForegroundColor Green
    } else {
        Write-Host "[!] Warning: Node.js not found in PATH" -ForegroundColor Yellow
        Write-Host "[*] This rule will be skipped, but TCP rules should work" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[!] Warning: Failed to create Node.js program rule: $_" -ForegroundColor Yellow
}
Write-Host ""

# Display configured rules
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     Firewall Configuration Summary" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$rules = Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*Monster Super AI*" }
foreach ($rule in $rules) {
    Write-Host "  [+] $($rule.DisplayName)" -ForegroundColor Green
    Write-Host "      Direction: $($rule.Direction)" -ForegroundColor Gray
    Write-Host "      Action: $($rule.Action)" -ForegroundColor Gray
    Write-Host "      Enabled: $($rule.Enabled)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[+] Firewall configuration completed successfully!" -ForegroundColor Green
Write-Host "[*] Port 5001 is now open for Monster Super AI" -ForegroundColor Cyan
Write-Host ""

# Optional: Try to enable UPnP for automatic port forwarding
Write-Host "[*] Checking for UPnP support..." -ForegroundColor Cyan
try {
    # Check if UPnP service is running
    $upnpService = Get-Service -Name "SSDPSRV" -ErrorAction SilentlyContinue
    if ($upnpService -and $upnpService.Status -eq "Running") {
        Write-Host "[+] UPnP service is running" -ForegroundColor Green
        Write-Host "[*] Automatic port forwarding may be available" -ForegroundColor Cyan
    } else {
        Write-Host "[!] UPnP service is not running" -ForegroundColor Yellow
        Write-Host "[*] You may need to manually configure port forwarding on your router" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[!] Could not check UPnP status" -ForegroundColor Yellow
}
Write-Host ""

exit 0
