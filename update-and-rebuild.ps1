# Firecrawl MCP Server - Update and Rebuild Script
# Run this anytime you want to update to the latest version

Write-Host "🔥 Firecrawl MCP Server - Update & Rebuild" -ForegroundColor Cyan
Write-Host "==========================================`n" -ForegroundColor Cyan

$firerawlPath = "D:\movies\firecrawl-mcp-server"

# Check if directory exists
if (-not (Test-Path $firecrawlPath)) {
    Write-Host "❌ Firecrawl directory not found at: $firecrawlPath" -ForegroundColor Red
    Write-Host "Please run the initial setup first." -ForegroundColor Yellow
    exit 1
}

Set-Location $firecrawlPath

# Step 1: Check for local changes
Write-Host "📋 Checking for local changes..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have local changes. Creating backup..." -ForegroundColor Yellow
    $backupDir = "backup_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -Path "src/*" -Destination $backupDir -Recurse -Force
    Write-Host "✅ Backup created: $backupDir" -ForegroundColor Green
}

# Step 2: Pull latest changes
Write-Host "`n📥 Pulling latest changes from GitHub..." -ForegroundColor Yellow
$pullResult = git pull origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git pull failed: $pullResult" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Successfully pulled latest changes" -ForegroundColor Green

# Step 3: Install/update dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Step 4: Run patch if available
if (Test-Path "patch-fastmcp.cjs") {
    Write-Host "`n🔧 Applying VS Code compatibility patches..." -ForegroundColor Yellow
    node patch-fastmcp.cjs
}

# Step 5: Build
Write-Host "`n🔨 Building project..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed successfully" -ForegroundColor Green

# Step 6: Verify dist exists
if (Test-Path "dist/index.js") {
    Write-Host "`n✅ Output verified: dist/index.js exists" -ForegroundColor Green
} else {
    Write-Host "`n❌ Build output not found: dist/index.js" -ForegroundColor Red
    exit 1
}

# Final message
Write-Host "`n🎉 Update Complete!" -ForegroundColor Green
Write-Host "==========================================`n" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart VS Code to apply changes" -ForegroundColor White
Write-Host "  2. Check MCP logs in VS Code Output panel" -ForegroundColor White
Write-Host "  3. Test Firecrawl tools with GitHub Copilot`n" -ForegroundColor White

Write-Host "Configuration: d:\movies\new_pwa_c\.vscode\mcp.json" -ForegroundColor Gray
Write-Host "Server location: $firecrawlPath`n" -ForegroundColor Gray
