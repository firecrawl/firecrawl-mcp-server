# Monster Super AI - Troubleshooting Guide

Complete troubleshooting guide for Monster Super AI BEAST Edition on Windows 11 and cloud deployments.

Built by Kings From Earth Development

---

## 📋 Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Installation Issues](#installation-issues)
3. [Server Issues](#server-issues)
4. [Network & Access Issues](#network--access-issues)
5. [API & Service Issues](#api--service-issues)
6. [Firewall Issues](#firewall-issues)
7. [Cloud Deployment Issues](#cloud-deployment-issues)
8. [Performance Issues](#performance-issues)
9. [Browser Issues](#browser-issues)
10. [Advanced Troubleshooting](#advanced-troubleshooting)

---

## Quick Diagnostics

### Is the server running?

**Windows:**
```cmd
netstat -ano | findstr :5001
```

**Linux:**
```bash
netstat -tulpn | grep 5001
# or
lsof -i :5001
```

**Expected output:**
```
TCP    0.0.0.0:5001    0.0.0.0:0    LISTENING    12345
```

If nothing appears, the server is not running.

### Can you access the health check?

**Browser:**
```
http://localhost:5001/api/health
```

**Command Line:**
```cmd
curl http://localhost:5001/api/health
```

**Expected output:**
```json
{
  "status": "online",
  "services": {
    "claude": true,
    "openai": true,
    "deepgram": true,
    "cartesia": true,
    "tavily": true,
    "livekit": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Check Node.js version

```cmd
node --version
npm --version
```

**Required:**
- Node.js: v18.0.0 or higher
- npm: v9.0.0 or higher

### View server logs

**Local (Windows):**
- Look at the command prompt window running the server
- Errors will be displayed in red

**Cloud (PM2):**
```bash
pm2 logs monster-ai
pm2 logs monster-ai --lines 100
```

---

## Installation Issues

### Error: "Node.js is not installed"

**Solution 1: Install via SETUP_WINDOWS.bat**
```cmd
Right-click SETUP_WINDOWS.bat > Run as Administrator
```

**Solution 2: Manual installation**
1. Go to https://nodejs.org
2. Download LTS version
3. Run installer
4. Restart computer
5. Verify: `node --version`

**Solution 3: Add to PATH**
```cmd
# Check if Node.js is installed but not in PATH
where node

# If nothing found, manually add to PATH:
setx PATH "%PATH%;C:\Program Files\nodejs"
```

Restart command prompt after adding to PATH.

### Error: "npm install" fails

**Solution 1: Clear cache**
```cmd
npm cache clean --force
npm install
```

**Solution 2: Force installation**
```cmd
npm install --force
```

**Solution 3: Delete node_modules**
```cmd
rmdir /S /Q node_modules
del package-lock.json
npm install
```

**Solution 4: Use different registry**
```cmd
npm config set registry https://registry.npmjs.org/
npm install
```

### Error: "EACCES: permission denied"

**Windows:**
```cmd
# Run command prompt as Administrator
Right-click > Run as Administrator
npm install
```

**Linux:**
```bash
# Don't use sudo with npm install
# Instead, fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install
```

### Error: "Python not found"

Some npm packages require Python for building.

**Solution:**
```cmd
# Install Python 3
# From: https://www.python.org/downloads/

# Or use Windows Store
# Search for "Python 3.11"

# Verify installation
python --version
```

### Error: "node-gyp" build failures

**Solution:**
```cmd
# Install build tools
npm install --global windows-build-tools

# Or install Visual Studio Build Tools
# From: https://visualstudio.microsoft.com/downloads/
```

---

## Server Issues

### Server won't start

**Check 1: Port already in use**
```cmd
netstat -ano | findstr :5001
```

If port is in use:
```cmd
# Find PID from netstat output
taskkill /F /PID [PID_NUMBER]

# Example:
taskkill /F /PID 12345
```

**Check 2: Missing .env.ultimate**
```cmd
# Check if file exists
dir .env.ultimate

# If missing, create from example
copy .env.ultimate.example .env.ultimate
```

**Check 3: Corrupted dependencies**
```cmd
rmdir /S /Q node_modules
npm install
```

**Check 4: Check for errors**
```cmd
node server-ultimate.js
```
Look for error messages and address them.

### Server starts but immediately crashes

**Check logs for errors:**
```cmd
node server-ultimate.js
```

**Common causes:**

1. **Invalid API key format**
   - Check `.env.ultimate` for typos
   - Ensure no extra spaces or quotes
   - Verify keys are valid

2. **Missing dependencies**
   ```cmd
   npm install
   ```

3. **Port conflict**
   - Change PORT in `.env.ultimate`
   - Use different port like 5002

4. **Syntax error in code**
   - Check if you modified any files
   - Restore from backup

### Server runs but endpoints don't work

**Test health endpoint:**
```cmd
curl http://localhost:5001/api/health
```

**If 404 Not Found:**
- Server might be running different version
- Check `server-ultimate.js` is being used
- Verify correct port

**If 500 Internal Server Error:**
- Check server logs for errors
- Verify API keys are correct
- Test individual services

### Error: "Cannot find module"

**Solution:**
```cmd
# Install missing module
npm install

# If specific module missing
npm install [module-name]

# Example:
npm install express
```

### Error: "Port 5001 requires elevated privileges"

**Windows Solution:**
```cmd
# Run as Administrator
Right-click START_BEAST.bat > Run as Administrator
```

**Linux Solution:**
```bash
# Use port above 1024 (doesn't require root)
# Edit .env.ultimate
PORT=5001  # This is fine (> 1024)

# Or run with sudo (not recommended)
sudo node server-ultimate.js
```

---

## Network & Access Issues

### Can't access from browser (localhost)

**Check 1: Server is running**
```cmd
netstat -ano | findstr :5001
```

**Check 2: Correct URL**
```
✅ http://localhost:5001
✅ http://127.0.0.1:5001
❌ https://localhost:5001  (wrong - no SSL on local)
❌ http://localhost:5000   (wrong port)
```

**Check 3: Browser cache**
```
Press Ctrl + Shift + Delete
Clear cache and cookies
Reload page
```

**Check 4: Try different browser**
- Chrome
- Edge
- Firefox

### Can't access from network (iPhone/other devices)

**Check 1: Get correct IP address**
```cmd
ipconfig

# Look for IPv4 Address under your network adapter
# Example: 192.168.1.100
```

**Check 2: Firewall blocking**
```powershell
# Re-run firewall configuration
Set-ExecutionPolicy Bypass -Scope Process
.\configure-firewall.ps1
```

**Check 3: Same WiFi network**
- Both devices must be on same WiFi
- Not 4G/5G on phone
- Not guest network

**Check 4: Router restrictions**
- Some routers block device-to-device communication
- Check router settings for "AP Isolation"
- Disable AP Isolation if enabled

**Check 5: Windows Firewall**
```cmd
# Temporarily disable to test
# Windows Security > Firewall & network protection > Turn off

# If it works, the firewall is the issue
# Re-enable and configure properly
```

**Check 6: Test with ping**
```cmd
# From iPhone/other device
# Open browser, go to: http://192.168.1.100:5001/api/health
# Replace with your IP

# Or use network scanner app to verify device is reachable
```

### Error: "ERR_CONNECTION_REFUSED"

**Cause:** Server is not running or firewall is blocking

**Solution:**
1. **Start server:**
   ```cmd
   START_BEAST.bat
   ```

2. **Configure firewall:**
   ```powershell
   .\configure-firewall.ps1
   ```

3. **Check antivirus:**
   - Norton, McAfee, etc. may block
   - Add exception for Node.js
   - Allow port 5001

### Error: "ERR_CONNECTION_TIMED_OUT"

**Cause:** Network issue or firewall

**Solution:**
1. **Check server is running**
2. **Verify IP address is correct**
3. **Check firewall rules**
4. **Restart router** (sometimes helps)

### Slow connection from network

**Causes:**
- Weak WiFi signal
- Router congestion
- Too many devices

**Solutions:**
1. Move closer to router
2. Use 5GHz WiFi band instead of 2.4GHz
3. Restart router
4. Reduce number of connected devices

---

## API & Service Issues

### All API calls fail

**Check .env.ultimate:**
```cmd
notepad .env.ultimate
```

**Verify:**
- All API keys are present
- No extra spaces
- No quotes around keys
- Keys are valid (not expired)

**Test individually:**
```bash
# Test Claude
curl -X POST http://localhost:5001/api/claude/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'

# Test OpenAI
curl -X POST http://localhost:5001/api/openai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'
```

### Specific service not working

**Check health endpoint:**
```
http://localhost:5001/api/health
```

Look at which services show `false`.

**Claude not working:**
- Verify `ANTHROPIC_API_KEY`
- Check API key on console.anthropic.com
- Verify credits available
- Check rate limits

**OpenAI not working:**
- Verify `OPENAI_API_KEY`
- Check API key on platform.openai.com
- Verify credits available
- Check rate limits

**Deepgram not working:**
- Verify `DEEPGRAM_API_KEY`
- Check console.deepgram.com
- Verify credits available

**Cartesia not working:**
- Verify `CARTESIA_API_KEY`
- Check play.cartesia.ai
- Verify account is active

**Tavily not working:**
- Verify `TAVILY_API_KEY`
- Check app.tavily.com
- Verify free tier limit not exceeded

**LiveKit not working:**
- Verify all three:
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
- Check cloud.livekit.io
- Verify project is active

### Error: "Invalid API key"

**Solutions:**

1. **Regenerate API key:**
   - Go to service dashboard
   - Delete old key
   - Create new key
   - Update `.env.ultimate`
   - Restart server

2. **Check key format:**
   - OpenAI: Starts with `sk-`
   - Anthropic: Starts with `sk-ant-`
   - Others: Verify on their dashboard

3. **No extra characters:**
   ```bash
   # Bad
   OPENAI_API_KEY=" sk-your-key "  # Extra spaces and quotes

   # Good
   OPENAI_API_KEY=sk-your-key      # Clean
   ```

### Error: "Rate limit exceeded"

**Cause:** Too many API calls

**Solutions:**

1. **Wait:**
   - Most limits reset after 1 minute
   - Some reset after 1 hour or 1 day

2. **Check usage:**
   - Visit service dashboard
   - View current usage
   - Check limits

3. **Upgrade plan:**
   - Free tiers have low limits
   - Consider paid tier for production

4. **Implement caching:**
   - Cache common responses
   - Reduce duplicate calls

### Error: "Insufficient credits"

**Solution:**
1. Visit service dashboard
2. Add payment method
3. Purchase credits
4. Verify credits available

---

## Firewall Issues

### Firewall script fails

**Error: "Execution Policy"**

**Solution:**
```powershell
# Temporarily bypass execution policy
Set-ExecutionPolicy Bypass -Scope Process
.\configure-firewall.ps1
```

**Error: "Access Denied"**

**Solution:**
```powershell
# Run PowerShell as Administrator
Right-click PowerShell > Run as Administrator
.\configure-firewall.ps1
```

### Port still blocked after firewall configuration

**Check Windows Defender Firewall:**

1. Open **Windows Defender Firewall**
2. Click **"Advanced settings"**
3. Click **"Inbound Rules"**
4. Look for **"Monster Super AI"** rules
5. Verify they are **Enabled** and **Allow**

**Check third-party firewall:**

- Norton, McAfee, Kaspersky, etc.
- Add Node.js to allowed programs
- Add port 5001 to allowed ports

**Test without firewall:**

1. **Temporarily disable Windows Firewall**
2. Test if it works
3. If yes, firewall is the issue
4. Re-enable and configure properly

### Can't modify firewall rules

**Cause:** Not Administrator

**Solution:**
```cmd
# Always run as Administrator for firewall changes
Right-click > Run as Administrator
```

---

## Cloud Deployment Issues

### SSH connection fails

**Error: "Connection refused"**

**Solutions:**

1. **Check server IP:**
   - Verify IP is correct
   - Check Hostinger email for details

2. **Check SSH port:**
   - Usually 22
   - Some hosts use different ports
   - Check hosting control panel

3. **Check SSH service:**
   ```bash
   # On server
   sudo systemctl status ssh
   sudo systemctl start ssh
   ```

4. **Check firewall:**
   ```bash
   # On server
   sudo ufw allow 22/tcp
   ```

**Error: "Permission denied (publickey)"**

**Solutions:**

1. **Use password authentication:**
   ```cmd
   ssh -o PreferredAuthentications=password username@host
   ```

2. **Generate and add SSH key:**
   ```cmd
   ssh-keygen -t rsa -b 4096
   ssh-copy-id username@host
   ```

### File upload fails

**Error: "Permission denied"**

**Solution:**
```bash
# On server, check directory permissions
ls -la /home/username/

# Fix permissions
chmod 755 /home/username/monster-ai
chown username:username /home/username/monster-ai
```

**Error: "Connection reset"**

**Solutions:**
1. Check internet connection
2. Try again (network glitch)
3. Use different upload method (FTP, cPanel)

### PM2 not starting

**Error: "PM2 not found"**

**Solution:**
```bash
# Install PM2
sudo npm install -g pm2

# Verify installation
pm2 --version
```

**Error: "Script not found"**

**Solution:**
```bash
# Check file exists
ls -la server-ultimate.js

# Use absolute path
pm2 start /full/path/to/server-ultimate.js --name monster-ai
```

### Nginx not working

**Error: "nginx: command not found"**

**Solution:**
```bash
# Install Nginx
sudo apt update
sudo apt install nginx -y

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

**Error: "Configuration test failed"**

**Solution:**
```bash
# Test configuration
sudo nginx -t

# Check for errors in output
# Fix configuration file
sudo nano /etc/nginx/sites-available/monster-ai

# Test again
sudo nginx -t

# Reload if successful
sudo systemctl reload nginx
```

### SSL certificate fails

**Error: "Challenge failed"**

**Solutions:**

1. **Check domain DNS:**
   ```bash
   nslookup your-domain.com
   ```
   - Must point to your server IP
   - Wait for DNS propagation (up to 24 hours)

2. **Check port 80 open:**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. **Check Nginx running:**
   ```bash
   sudo systemctl status nginx
   ```

4. **Try manual mode:**
   ```bash
   sudo certbot certonly --manual -d your-domain.com
   ```

---

## Performance Issues

### Server is slow

**Check CPU/Memory:**

**Windows:**
```cmd
# Open Task Manager
Ctrl + Shift + Esc
# Look for node.exe process
```

**Linux:**
```bash
htop
# or
top
```

**Solutions:**

1. **Limit conversation history:**
   Edit `server-ultimate.js`:
   ```javascript
   // In conversation endpoint, add:
   if (history.length > 50) {
       history.splice(0, history.length - 50);
   }
   ```

2. **Increase memory limit:**
   ```bash
   node --max-old-space-size=4096 server-ultimate.js
   ```

3. **Use PM2 cluster mode:**
   ```bash
   pm2 start server-ultimate.js -i max
   ```

### API calls are slow

**Causes:**
- Slow internet connection
- API service congestion
- Large responses

**Solutions:**

1. **Reduce response size:**
   ```javascript
   // Use lower max_tokens
   max_tokens: 1000  // Instead of 8096
   ```

2. **Disable web search when not needed:**
   - Turn off web search toggle
   - Faster responses

3. **Use faster AI model:**
   - Switch to GPT-3.5 instead of GPT-4
   - Faster but less capable

### High memory usage

**Check memory:**
```bash
pm2 monit
```

**Solutions:**

1. **Set memory limit:**
   ```bash
   pm2 start server-ultimate.js --max-memory-restart 500M
   ```

2. **Clear conversation history:**
   ```bash
   # Restart server to clear in-memory data
   pm2 restart monster-ai
   ```

3. **Upgrade server:**
   - More RAM
   - Better hosting plan

### Too many particles (laggy animations)

**Edit HTML file:**

```javascript
// Find these lines and reduce values

// Hologram particles (line ~1093)
const particleCount = 15;  // Instead of 30

// App particles (line ~1104)
const particleCount = 50;  // Instead of 100
```

**Or skip intro:**
```javascript
// Add at top of script
skipIntro();
```

---

## Browser Issues

### Microphone not working

**Requirements:**
- HTTPS (or localhost)
- Browser permission granted
- Microphone connected

**Solutions:**

1. **Check browser permissions:**
   - Click lock icon in address bar
   - Allow microphone access
   - Reload page

2. **Check browser support:**
   - ✅ Chrome/Edge (best)
   - ✅ Firefox
   - ❌ Safari (limited)
   - ❌ Internet Explorer (not supported)

3. **Check microphone:**
   - Test in other apps
   - Check Windows sound settings
   - Verify not muted

4. **Use HTTPS for production:**
   - HTTP only works on localhost
   - Remote access requires HTTPS

### Animations not working

**Check browser console:**
```
Press F12 > Console tab
Look for JavaScript errors
```

**Solutions:**

1. **Clear browser cache:**
   ```
   Ctrl + Shift + Delete
   Clear cache
   Hard reload: Ctrl + F5
   ```

2. **Update browser:**
   - Use latest version
   - Chrome/Edge recommended

3. **Disable browser extensions:**
   - Ad blockers may interfere
   - Try incognito mode

### Voice output not working

**Check:**
1. **Browser supports Web Speech API**
2. **Sound is not muted**
3. **Cartesia API key is valid**

**Solutions:**

1. **Test with browser TTS:**
   - Click voice button
   - Check browser console for errors

2. **Verify Cartesia API:**
   - Check `.env.ultimate`
   - Test Cartesia endpoint directly

3. **Check audio output:**
   - Verify speakers/headphones work
   - Check volume levels

### CORS errors

**Error:** "Access-Control-Allow-Origin"

**Cause:** CORS not configured properly

**Solution:**

Server already has CORS enabled. If you modified code:

```javascript
// Add at top of server-ultimate.js
import cors from 'cors';
app.use(cors());
```

---

## Advanced Troubleshooting

### Enable debug logging

**Add to server-ultimate.js:**

```javascript
// After imports
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// For API errors
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
});
```

### Save logs to file

**Windows:**
```cmd
node server-ultimate.js > server.log 2>&1
```

**Linux:**
```bash
pm2 start server-ultimate.js --name monster-ai --log server.log
```

### Test individual components

**Test Claude API directly:**
```javascript
// test-claude.js
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: 'your-key' });

const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }]
});

console.log(message.content[0].text);
```

### Network debugging

**Check all connections:**
```cmd
netstat -ano | findstr :5001
```

**Test localhost connection:**
```cmd
telnet localhost 5001
```

**Test network connection:**
```cmd
telnet 192.168.1.100 5001
```

### Database/State issues

**Clear PM2 state:**
```bash
pm2 delete monster-ai
pm2 start server-ultimate.js --name monster-ai
```

**Clear conversation history:**
- Restart server (in-memory storage)
- Or add clear endpoint

---

## Getting Help

### Collect diagnostic information

**Before asking for help, gather:**

1. **System information:**
   ```cmd
   systeminfo | findstr /B /C:"OS Name" /C:"OS Version"
   node --version
   npm --version
   ```

2. **Server logs:**
   - Copy error messages
   - Include full stack trace

3. **Configuration:**
   - .env.ultimate (remove API keys!)
   - Package.json versions

4. **Network information:**
   ```cmd
   ipconfig
   netstat -ano | findstr :5001
   ```

5. **What you tried:**
   - List all troubleshooting steps attempted
   - What worked, what didn't

### Check documentation

- README.md - Project overview
- WINDOWS_SETUP.md - Local setup
- CLOUD_DEPLOYMENT.md - Cloud deployment
- AUTOMATION_GUIDE.md - Script reference
- This file (TROUBLESHOOTING.md)

### Community resources

- GitHub Issues
- API service documentation
- Stack Overflow
- Node.js documentation

---

## Common Error Messages

### "EADDRINUSE"

**Meaning:** Port already in use

**Solution:**
```cmd
netstat -ano | findstr :5001
taskkill /F /PID [PID]
```

### "EACCES"

**Meaning:** Permission denied

**Solution:**
```cmd
Run as Administrator
```

### "MODULE_NOT_FOUND"

**Meaning:** Missing dependency

**Solution:**
```cmd
npm install
```

### "ECONNREFUSED"

**Meaning:** Can't connect to server

**Solution:**
```cmd
Check server is running
Check firewall
```

### "ETIMEDOUT"

**Meaning:** Connection timeout

**Solution:**
```cmd
Check internet connection
Check API keys
Try again
```

### "CERTIFICATE_VERIFY_FAILED"

**Meaning:** SSL certificate issue

**Solution:**
```bash
# Update certificates
sudo apt update
sudo apt install ca-certificates
```

---

## Reset Everything

If all else fails, start fresh:

### Windows Reset

```cmd
REM 1. Stop server
taskkill /F /IM node.exe

REM 2. Delete node_modules
rmdir /S /Q node_modules

REM 3. Delete package-lock.json
del package-lock.json

REM 4. Reinstall
npm install

REM 5. Recreate .env.ultimate
copy .env.ultimate.example .env.ultimate
notepad .env.ultimate

REM 6. Reconfigure firewall
powershell -ExecutionPolicy Bypass -File configure-firewall.ps1

REM 7. Start server
START_BEAST.bat
```

### Cloud Reset

```bash
# 1. Stop and delete PM2 process
pm2 stop monster-ai
pm2 delete monster-ai

# 2. Remove project
cd ~
rm -rf monster-ai

# 3. Re-upload files
# (Use deployment script)

# 4. Run deployment
bash deploy-hostinger.sh
```

---

## Prevention Tips

### Best practices to avoid issues:

1. **Keep API keys in .env.ultimate only**
   - Never hardcode in JavaScript
   - Don't commit to git

2. **Keep dependencies updated:**
   ```cmd
   npm update
   ```

3. **Test locally before deploying to cloud**

4. **Backup configuration:**
   ```cmd
   copy .env.ultimate .env.ultimate.backup
   ```

5. **Monitor API usage:**
   - Check service dashboards regularly
   - Set up billing alerts

6. **Use PM2 for production:**
   - Auto-restart on crash
   - Log management
   - Monitoring

7. **Setup SSL for production:**
   - Required for microphone
   - Better security

8. **Keep logs:**
   ```bash
   pm2 install pm2-logrotate
   ```

9. **Regular backups:**
   - Database (if any)
   - Configuration files
   - Custom code

10. **Monitor server health:**
    ```bash
    pm2 monit
    ```

---

## Still Having Issues?

### Last resort checklist:

- [ ] Read all documentation
- [ ] Checked server is running
- [ ] Verified all API keys
- [ ] Cleared cache and restarted
- [ ] Tested on different browser
- [ ] Checked firewall settings
- [ ] Reviewed server logs
- [ ] Tried reset procedures
- [ ] Googled the error message
- [ ] Checked service status pages

### Contact information:

For persistent issues:

1. Check GitHub issues
2. Create new issue with diagnostic info
3. Join community Discord/Slack
4. Contact Kings From Earth Development

**Include in your report:**
- Detailed description
- Steps to reproduce
- Error messages
- System information
- What you've tried

---

**Built by Kings From Earth Development 👑**

For more help, see:
- WINDOWS_SETUP.md
- CLOUD_DEPLOYMENT.md
- AUTOMATION_GUIDE.md
