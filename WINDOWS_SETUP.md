# Monster Super AI - Windows 11 Setup Guide

Complete step-by-step guide for installing and configuring Monster Super AI BEAST Edition on Windows 11.

Built by Kings From Earth Development

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (One-Click)](#quick-start-one-click)
3. [Manual Installation](#manual-installation)
4. [Configuration](#configuration)
5. [Network Access](#network-access)
6. [Firewall Configuration](#firewall-configuration)
7. [Auto-Start on Boot](#auto-start-on-boot)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Operating System**: Windows 11 (or Windows 10)
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: 500MB free space
- **Internet**: Stable internet connection for API calls

### Required Software

- **Node.js**: Version 18.0.0 or higher (will be auto-installed)
- **Web Browser**: Chrome, Edge, or Firefox (latest version)

### API Keys Required

You'll need API keys from these services:

1. **LiveKit** - https://cloud.livekit.io
2. **OpenAI** - https://platform.openai.com/api-keys
3. **Deepgram** - https://console.deepgram.com
4. **Cartesia** - https://play.cartesia.ai
5. **Tavily** - https://app.tavily.com
6. **Anthropic (Claude)** - https://console.anthropic.com

---

## Quick Start (One-Click)

### Method 1: Full Automated Setup

1. **Download the project** to your computer
2. **Right-click** on `SETUP_WINDOWS.bat`
3. Select **"Run as Administrator"**
4. Follow the on-screen prompts
5. Edit `.env.ultimate` with your API keys
6. Done! Double-click "Monster Super AI" on your desktop

**Total Time**: ~5 minutes (including downloads)

### What the Setup Script Does

The automated setup script:

✅ Checks if Node.js is installed (installs if missing)
✅ Installs all npm dependencies
✅ Configures Windows Firewall for port 5001
✅ Creates desktop shortcut
✅ Sets up auto-start on boot (optional)
✅ Tests server startup

---

## Manual Installation

If you prefer to install manually or the automated script fails:

### Step 1: Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS version** (recommended)
3. Run the installer
4. Accept default settings
5. Restart your computer

**Verify installation:**
```cmd
node --version
npm --version
```

### Step 2: Install Dependencies

Open Command Prompt or PowerShell in the project folder:

```cmd
npm install
```

If you encounter errors:
```cmd
npm install --force
```

### Step 3: Configure Environment

1. Copy `.env.ultimate.example` to `.env.ultimate`
2. Open `.env.ultimate` in notepad
3. Add your API keys (see Configuration section)

### Step 4: Configure Firewall

**Option A: Using PowerShell (Recommended)**

Right-click PowerShell and "Run as Administrator":

```powershell
Set-ExecutionPolicy Bypass -Scope Process
.\configure-firewall.ps1
```

**Option B: Manual Configuration**

1. Open **Windows Defender Firewall**
2. Click **"Advanced settings"**
3. Click **"Inbound Rules"** → **"New Rule"**
4. Select **"Port"** → Next
5. Select **"TCP"** and enter port **5001** → Next
6. Select **"Allow the connection"** → Next
7. Check all profiles → Next
8. Name: **"Monster Super AI"** → Finish

### Step 5: Create Desktop Shortcut

1. Right-click on `START_BEAST.bat`
2. Select **"Send to"** → **"Desktop (create shortcut)"**
3. Rename to **"Monster Super AI"**

---

## Configuration

### API Keys Setup

Edit `.env.ultimate` file with your API keys:

```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# OpenAI API
OPENAI_API_KEY=sk-your-openai-key

# Deepgram (Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_key

# Cartesia (Voice Synthesis)
CARTESIA_API_KEY=your_cartesia_key

# Tavily (Web Search)
TAVILY_API_KEY=your_tavily_key

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Server Configuration
PORT=5001
NODE_ENV=production
```

### How to Get API Keys

#### 1. LiveKit
- Go to https://cloud.livekit.io
- Create free account
- Create new project
- Copy **API Key**, **Secret**, and **WebSocket URL**

#### 2. OpenAI
- Go to https://platform.openai.com
- Create account / Login
- Navigate to **API Keys**
- Click **"Create new secret key"**

#### 3. Deepgram
- Go to https://console.deepgram.com
- Sign up for free account
- Copy your **API Key** from dashboard

#### 4. Cartesia
- Go to https://play.cartesia.ai
- Create account
- Find API key in account settings

#### 5. Tavily
- Go to https://app.tavily.com
- Sign up for free tier
- Copy API key from dashboard

#### 6. Anthropic (Claude)
- Go to https://console.anthropic.com
- Create account
- Navigate to **API Keys**
- Create new key

---

## Network Access

### Local Access Only

By default, the server runs on:
- `http://localhost:5001`
- Only accessible from your computer

### Network Access (iPhone, Other Devices)

To access from other devices on your network:

#### Step 1: Find Your IP Address

**Option A: Command Prompt**
```cmd
ipconfig
```
Look for **"IPv4 Address"** under your network adapter (usually something like `192.168.1.100`)

**Option B: Settings**
1. Open **Settings**
2. Go to **Network & Internet**
3. Click your connection
4. Find **"IPv4 address"**

#### Step 2: Configure Firewall

The setup script should have configured this automatically. If not, see Firewall Configuration section.

#### Step 3: Access from Other Devices

On your phone or other device, open browser and go to:
```
http://YOUR_IP_ADDRESS:5001/monster-ai-ultimate-v2.html
```

Example:
```
http://192.168.1.100:5001/monster-ai-ultimate-v2.html
```

**Important Notes:**
- Device must be on the same WiFi network
- Firewall must allow port 5001
- Some routers may block this by default

---

## Firewall Configuration

### Automatic Configuration

Run the firewall configuration script:

```powershell
# Right-click PowerShell and "Run as Administrator"
Set-ExecutionPolicy Bypass -Scope Process
.\configure-firewall.ps1
```

### Manual Configuration

#### Windows Defender Firewall

1. Open **Control Panel**
2. Go to **System and Security** → **Windows Defender Firewall**
3. Click **"Advanced settings"**

**Create Inbound Rule:**
1. Click **"Inbound Rules"** → **"New Rule"**
2. Rule Type: **Port** → Next
3. Protocol: **TCP**, Specific ports: **5001** → Next
4. Action: **Allow the connection** → Next
5. Profile: Check **all** (Domain, Private, Public) → Next
6. Name: **Monster Super AI - TCP In** → Finish

**Create Outbound Rule:**
1. Click **"Outbound Rules"** → **"New Rule"**
2. Follow same steps as above

#### Third-Party Firewalls

If using Norton, McAfee, or other security software:

**Norton:**
- Open Norton
- Settings → Firewall → Program Control
- Add `node.exe` → Allow

**McAfee:**
- Open McAfee
- Firewall → Ports and System Services
- Add port 5001

### Verify Firewall Rules

```powershell
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Monster*"}
```

---

## Auto-Start on Boot

### Automatic Setup

During installation, you'll be asked if you want auto-start. If you skipped it:

```powershell
# Right-click PowerShell and "Run as Administrator"
Set-ExecutionPolicy Bypass -Scope Process
.\setup-startup.ps1
```

### Manual Setup

#### Method 1: Startup Folder

1. Press `Win + R`
2. Type: `shell:startup`
3. Press Enter
4. Create shortcut to `START_BEAST.bat` in this folder

#### Method 2: Task Scheduler

1. Open **Task Scheduler**
2. Click **"Create Basic Task"**
3. Name: **Monster Super AI**
4. Trigger: **When I log on**
5. Action: **Start a program**
6. Program: Browse to `START_BEAST.bat`
7. Finish

### Disable Auto-Start

**Remove Startup Folder Shortcut:**
1. Press `Win + R`
2. Type: `shell:startup`
3. Delete the Monster Super AI shortcut

**Remove Scheduled Task:**
```powershell
Unregister-ScheduledTask -TaskName "MonsterSuperAI_AutoStart" -Confirm:$false
```

---

## Starting the Server

### Method 1: Desktop Shortcut

Double-click **"Monster Super AI"** on your desktop

### Method 2: Batch Files

**Full server with browser auto-open:**
```
Double-click: START_BEAST.bat
```

**Server only (no browser):**
```
Double-click: LOCAL_SERVER.bat
```

**Open browser only:**
```
Double-click: OPEN_IN_BROWSER.bat
```

### Method 3: Command Line

```cmd
node server-ultimate.js
```

### Verify Server is Running

Check if server started successfully:

```cmd
netstat -ano | findstr :5001
```

You should see something like:
```
TCP    0.0.0.0:5001    0.0.0.0:0    LISTENING    12345
```

---

## Stopping the Server

### Method 1: Close Window

Simply close the command prompt window running the server

### Method 2: Ctrl+C

Press `Ctrl + C` in the server window

### Method 3: Kill Process

**Find the process:**
```cmd
netstat -ano | findstr :5001
```

**Kill it:**
```cmd
taskkill /F /PID [PID_NUMBER]
```

Example:
```cmd
taskkill /F /PID 12345
```

---

## Troubleshooting

### Port 5001 Already in Use

**Check what's using the port:**
```cmd
netstat -ano | findstr :5001
```

**Kill the process:**
```cmd
taskkill /F /PID [PID_NUMBER]
```

**Or change the port:**
Edit `.env.ultimate` and change `PORT=5001` to another port (e.g., `PORT=5002`)

### Node.js Not Found

After installing Node.js:
1. Close all Command Prompt/PowerShell windows
2. Open a new window
3. Try again

If still not working:
1. Restart your computer
2. Verify Node.js is in PATH

### Firewall Blocking Connection

**Temporarily disable to test:**
1. Open Windows Security
2. Firewall & network protection
3. Turn off temporarily
4. Test if it works
5. Turn back on and configure properly

### Browser Can't Connect

1. **Check server is running:**
   ```cmd
   netstat -ano | findstr :5001
   ```

2. **Check URL is correct:**
   - `http://localhost:5001` (NOT https)

3. **Clear browser cache:**
   - Press `Ctrl + Shift + Delete`
   - Clear cache and reload

4. **Try different browser:**
   - Chrome, Edge, or Firefox

### API Keys Not Working

1. **Verify keys are correct:**
   - Open `.env.ultimate`
   - Check for typos
   - No extra spaces or quotes

2. **Check API key validity:**
   - Log into each service
   - Verify keys are active
   - Check usage limits

3. **Restart server:**
   - Stop server (Ctrl+C)
   - Start again

### Permission Errors

**Run as Administrator:**
1. Right-click on batch file or PowerShell
2. Select "Run as Administrator"

### Dependencies Installation Fails

**Clear npm cache:**
```cmd
npm cache clean --force
npm install
```

**Force installation:**
```cmd
npm install --force
```

**Delete node_modules and reinstall:**
```cmd
rmdir /S /Q node_modules
npm install
```

---

## Advanced Configuration

### Change Port Number

Edit `.env.ultimate`:
```bash
PORT=5002  # Change to any available port
```

### Run in Background

Use **PM2** process manager:

```cmd
npm install -g pm2
pm2 start server-ultimate.js --name monster-ai
pm2 save
pm2 startup
```

### Multiple Instances

Run on different ports:

1. Create `.env.ultimate.5002` with `PORT=5002`
2. Run: `node server-ultimate.js --env .env.ultimate.5002`

---

## Network Troubleshooting

### Can't Access from iPhone

1. **Check same WiFi:**
   - Both devices on same network

2. **Check firewall:**
   - Port 5001 must be open

3. **Check IP address:**
   - Use `ipconfig` to get current IP
   - It may change after reboot

4. **Try disabling Windows Firewall:**
   - Temporarily for testing
   - Don't forget to re-enable

### Port Forwarding (Internet Access)

To access from outside your home network:

1. **Find router IP:**
   ```cmd
   ipconfig
   ```
   Look for "Default Gateway"

2. **Access router settings:**
   - Open browser
   - Go to router IP (e.g., 192.168.1.1)
   - Login with admin credentials

3. **Setup port forwarding:**
   - Find "Port Forwarding" or "Virtual Server"
   - External port: 5001
   - Internal IP: Your computer's IP
   - Internal port: 5001
   - Protocol: TCP

4. **Find public IP:**
   - Go to https://whatismyip.com
   - Use this IP to access from anywhere

**Security Warning:** Port forwarding exposes your server to the internet. Use strong passwords and HTTPS.

---

## Performance Optimization

### Reduce Memory Usage

Edit `server-ultimate.js` and add:
```javascript
// Limit conversation history
if (history.length > 50) {
    history.splice(0, history.length - 50);
}
```

### Faster Startup

Disable animations in HTML:
```javascript
// Skip intro
skipIntro();
```

### Reduce Particle Count

In HTML file, change:
```javascript
const particleCount = 50; // Instead of 100
```

---

## Security Best Practices

1. **Never commit .env.ultimate to git**
   - Already in .gitignore

2. **Use HTTPS for production**
   - Required for microphone access on non-localhost

3. **Rotate API keys regularly**
   - Change every 3-6 months

4. **Monitor API usage**
   - Check service dashboards for unusual activity

5. **Keep dependencies updated**
   ```cmd
   npm update
   ```

---

## Uninstallation

### Remove All Components

1. **Stop server**
2. **Remove startup entries:**
   ```powershell
   Unregister-ScheduledTask -TaskName "MonsterSuperAI_AutoStart"
   ```
3. **Remove firewall rules:**
   ```powershell
   Remove-NetFirewallRule -DisplayName "Monster Super AI*"
   ```
4. **Delete project folder**
5. **Delete desktop shortcut**

---

## Getting Help

### Common Commands

**Check server status:**
```cmd
netstat -ano | findstr :5001
```

**View Node.js version:**
```cmd
node --version
```

**View npm version:**
```cmd
npm --version
```

**Check firewall rules:**
```powershell
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Monster*"}
```

### Log Files

Server logs are printed to console. To save logs:

```cmd
node server-ultimate.js > server.log 2>&1
```

---

## Next Steps

✅ **Local setup complete!**
✅ **Server running on Windows 11**
✅ **Network access configured**

**What's Next:**

1. **Test all features:**
   - Voice input/output
   - All 6 AI services
   - Web search integration
   - LiveKit audio

2. **Deploy to cloud:**
   - Run `DEPLOY_TO_CLOUD.bat`
   - See CLOUD_DEPLOYMENT.md

3. **Customize:**
   - Edit colors and themes
   - Adjust animations
   - Configure system prompts

---

**Built by Kings From Earth Development 👑**

For more help, see:
- TROUBLESHOOTING.md
- CLOUD_DEPLOYMENT.md
- AUTOMATION_GUIDE.md
