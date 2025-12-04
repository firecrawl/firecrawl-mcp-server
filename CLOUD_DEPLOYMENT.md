# Monster Super AI - Cloud Deployment Guide

Complete guide for deploying Monster Super AI BEAST Edition to Hostinger and other cloud platforms.

Built by Kings From Earth Development

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Deployment (One-Click)](#quick-deployment-one-click)
3. [Hostinger Deployment](#hostinger-deployment)
4. [Manual Deployment](#manual-deployment)
5. [SSL Certificate Setup](#ssl-certificate-setup)
6. [Domain Configuration](#domain-configuration)
7. [PM2 Process Management](#pm2-process-management)
8. [Nginx Configuration](#nginx-configuration)
9. [Alternative Platforms](#alternative-platforms)
10. [Production Best Practices](#production-best-practices)

---

## Prerequisites

### Hosting Requirements

- **VPS or Cloud Server** (not shared hosting)
- **Operating System**: Ubuntu 20.04+ or similar Linux
- **RAM**: Minimum 1GB, Recommended 2GB+
- **Storage**: 10GB+ free space
- **Node.js**: Version 18.0.0+ (will be auto-installed)

### Hostinger Plans That Work

✅ **VPS Hosting** - Recommended
✅ **Cloud Hosting** - Best performance
❌ **Shared Hosting** - Not compatible (no Node.js support)

### Required Access

- **SSH Access** - For server configuration
- **Root/Sudo Access** - For installing software
- **Domain Name** - For public access (optional)
- **FTP/SFTP** - For file uploads

### API Keys

Have your API keys ready (same as local setup):
- LiveKit, OpenAI, Deepgram, Cartesia, Tavily, Anthropic

---

## Quick Deployment (One-Click)

### Using the Automated Script

1. **On Windows**, run:
   ```cmd
   DEPLOY_TO_CLOUD.bat
   ```

2. **Or use PowerShell:**
   ```powershell
   .\one-click-deploy.ps1
   ```

3. **Follow the prompts:**
   - Enter Hostinger hostname
   - Enter SSH username
   - Enter SSH port (usually 22)
   - Enter remote path
   - Enter your domain name

4. **Choose deployment method:**
   - [1] Automatic - Full automation via SSH
   - [2] Semi-Automatic - Generate commands
   - [3] Manual - Create ZIP for upload

5. **Complete server setup:**
   - SSH into server
   - Run deployment script
   - Add API keys
   - Start server

**Total Time**: ~10 minutes

---

## Hostinger Deployment

### Step 1: Purchase Hostinger VPS

1. Go to https://hostinger.com
2. Select **VPS Hosting** or **Cloud Hosting**
3. Choose a plan (minimum 1GB RAM)
4. Complete purchase
5. Wait for server provisioning email

### Step 2: Access Your Server

From the Hostinger email, get:
- **Server IP address**
- **SSH username** (usually `root` or `u123456789`)
- **SSH password**
- **SSH port** (usually 22)

### Step 3: Connect via SSH

**Option A: Using PuTTY (Windows)**

1. Download PuTTY from https://putty.org
2. Enter hostname: `your-server-ip`
3. Port: `22`
4. Click "Open"
5. Login with username and password

**Option B: Using OpenSSH (Windows 10/11)**

Open PowerShell:
```powershell
ssh username@your-server-ip -p 22
```

**Option C: Using Hostinger Browser SSH**

1. Login to Hostinger hPanel
2. Go to VPS dashboard
3. Click "Browser SSH"

### Step 4: Upload Files

**Method A: Using WinSCP (Recommended)**

1. Download WinSCP from https://winscp.net
2. Create new connection:
   - Protocol: SFTP
   - Host: your-server-ip
   - Port: 22
   - Username: your-ssh-username
   - Password: your-ssh-password
3. Connect
4. Upload these files:
   - `server-ultimate.js`
   - `package.json`
   - `.env.ultimate.example`
   - `monster-ai-ultimate-v2.html`
   - `deploy-hostinger.sh`
   - `public/` folder (if exists)

**Method B: Using SCP Command**

```powershell
# From Windows PowerShell in project directory
scp -P 22 -r * username@your-server-ip:/home/username/monster-ai/
```

**Method C: Using Hostinger File Manager**

1. Login to hPanel
2. Go to File Manager
3. Create folder: `monster-ai`
4. Upload files
5. Extract if uploaded as ZIP

### Step 5: Run Deployment Script

SSH into your server:

```bash
# Navigate to project directory
cd /home/username/monster-ai

# Make script executable
chmod +x deploy-hostinger.sh

# Run deployment script
bash deploy-hostinger.sh
```

The script will automatically:
- ✅ Update system packages
- ✅ Install Node.js (if not present)
- ✅ Install npm dependencies
- ✅ Install PM2 process manager
- ✅ Configure firewall
- ✅ Setup Nginx (if installed)
- ✅ Start the server
- ✅ Configure auto-restart

### Step 6: Configure API Keys

Edit the environment file:

```bash
nano .env.ultimate
```

Add your API keys:
```bash
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
OPENAI_API_KEY=sk-your-openai-key
DEEPGRAM_API_KEY=your_deepgram_key
CARTESIA_API_KEY=your_cartesia_key
TAVILY_API_KEY=your_tavily_key
ANTHROPIC_API_KEY=sk-ant-your-key
PORT=5001
NODE_ENV=production
```

**Save and exit:** `Ctrl + X`, then `Y`, then `Enter`

### Step 7: Restart Server

```bash
pm2 restart monster-ai
```

### Step 8: Test Access

Open browser and go to:
```
http://your-server-ip:5001/monster-ai-ultimate-v2.html
```

If it loads, deployment is successful!

---

## Manual Deployment

If automated scripts fail, follow these manual steps:

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 3. Install Dependencies

```bash
cd /path/to/monster-ai
npm install --production
```

### 4. Install PM2

```bash
sudo npm install -g pm2
```

### 5. Start Server

```bash
pm2 start server-ultimate.js --name monster-ai
```

### 6. Configure Auto-Start

```bash
pm2 startup
# Copy and run the command it displays
pm2 save
```

### 7. Configure Firewall

```bash
# Allow port 5001
sudo ufw allow 5001/tcp

# Allow SSH (important!)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

---

## SSL Certificate Setup

HTTPS is **required** for:
- Microphone access (Web Speech API)
- Production deployment
- Security best practices

### Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Get SSL Certificate

```bash
# Replace with your domain
sudo certbot --nginx -d supermonsterai.kingsfromearthdevelopment.com

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

### Verify SSL

Browser should show:
- 🔒 Padlock icon
- `https://` in URL
- Valid certificate

### Auto-Renewal

Certbot automatically renews. Test with:

```bash
sudo certbot renew --dry-run
```

---

## Domain Configuration

### Step 1: Add Domain in Hostinger

1. Login to hPanel
2. Go to **Domains**
3. Click **"Add Domain"** or use existing domain

### Step 2: Configure DNS Records

Add these DNS records:

**A Record:**
```
Type: A
Name: supermonsterai (or @)
Value: YOUR_SERVER_IP
TTL: 3600
```

**CNAME Record (optional, for www):**
```
Type: CNAME
Name: www
Value: supermonsterai.kingsfromearthdevelopment.com
TTL: 3600
```

### Step 3: Wait for DNS Propagation

- Usually takes 5-30 minutes
- Can take up to 24 hours

**Check DNS propagation:**
```bash
nslookup supermonsterai.kingsfromearthdevelopment.com
```

### Step 4: Update Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/monster-ai
```

Change `server_name` to your domain:
```nginx
server_name supermonsterai.kingsfromearthdevelopment.com;
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## PM2 Process Management

### Essential PM2 Commands

**Start server:**
```bash
pm2 start server-ultimate.js --name monster-ai
```

**Stop server:**
```bash
pm2 stop monster-ai
```

**Restart server:**
```bash
pm2 restart monster-ai
```

**Delete process:**
```bash
pm2 delete monster-ai
```

**View logs:**
```bash
pm2 logs monster-ai

# Real-time logs
pm2 logs monster-ai --lines 100
```

**Check status:**
```bash
pm2 status
```

**Monitor in real-time:**
```bash
pm2 monit
```

**Save current processes:**
```bash
pm2 save
```

**Setup auto-start on boot:**
```bash
pm2 startup
# Run the command it displays
pm2 save
```

### PM2 Advanced

**Start with custom settings:**
```bash
pm2 start server-ultimate.js --name monster-ai \
  --instances 2 \
  --max-memory-restart 500M \
  --log-date-format "YYYY-MM-DD HH:mm:ss"
```

**View detailed info:**
```bash
pm2 info monster-ai
```

**Reset restart counter:**
```bash
pm2 reset monster-ai
```

---

## Nginx Configuration

### Install Nginx

```bash
sudo apt install nginx -y
```

### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/monster-ai
```

**Basic Configuration (HTTP only):**
```nginx
server {
    listen 80;
    server_name supermonsterai.kingsfromearthdevelopment.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    # Static files (if any)
    location /public/ {
        alias /path/to/monster-ai/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Enable the site:**
```bash
sudo ln -s /etc/nginx/sites-available/monster-ai /etc/nginx/sites-enabled/
```

**Test configuration:**
```bash
sudo nginx -t
```

**Reload Nginx:**
```bash
sudo systemctl reload nginx
```

### Full Configuration (with SSL)

After running Certbot, your config will look like:

```nginx
server {
    listen 80;
    server_name supermonsterai.kingsfromearthdevelopment.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name supermonsterai.kingsfromearthdevelopment.com;

    ssl_certificate /etc/letsencrypt/live/supermonsterai.kingsfromearthdevelopment.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supermonsterai.kingsfromearthdevelopment.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering off;
        proxy_buffer_size 4k;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Max upload size (if needed)
    client_max_body_size 10M;
}
```

---

## Alternative Platforms

### DigitalOcean

1. Create Droplet (Ubuntu 22.04)
2. Follow manual deployment steps
3. Use same Nginx/PM2 configuration

**One-Click Setup:**
```bash
ssh root@your-droplet-ip
git clone your-repo
cd monster-ai
bash deploy-hostinger.sh
```

### AWS EC2

1. Launch EC2 instance (t2.micro for free tier)
2. Choose Ubuntu 22.04 AMI
3. Configure security group (ports 22, 80, 443, 5001)
4. SSH and deploy

### Heroku

1. Install Heroku CLI
2. Create Procfile:
   ```
   web: node server-ultimate.js
   ```
3. Deploy:
   ```bash
   heroku create monster-super-ai
   heroku config:set OPENAI_API_KEY=your-key
   # Set all other env vars
   git push heroku main
   ```

### Google Cloud Platform

1. Create VM instance
2. Allow HTTP/HTTPS traffic
3. SSH and deploy manually

### Azure

1. Create Virtual Machine
2. Open ports 22, 80, 443, 5001
3. SSH and deploy

---

## Production Best Practices

### Security

1. **Change default SSH port:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Change Port 22 to Port 2222
   sudo systemctl restart sshd
   ```

2. **Disable root login:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   ```

3. **Setup SSH keys (disable password auth):**
   ```bash
   ssh-keygen -t rsa -b 4096
   ssh-copy-id user@server
   ```

4. **Install Fail2Ban:**
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   ```

5. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

### Performance

1. **Enable Nginx caching:**
   ```nginx
   proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g;
   ```

2. **Use PM2 cluster mode:**
   ```bash
   pm2 start server-ultimate.js -i max
   ```

3. **Optimize Node.js:**
   ```bash
   export NODE_ENV=production
   ```

### Monitoring

1. **Setup PM2 monitoring:**
   ```bash
   pm2 install pm2-logrotate
   ```

2. **Monitor server resources:**
   ```bash
   htop
   ```

3. **Check disk space:**
   ```bash
   df -h
   ```

4. **Monitor logs:**
   ```bash
   pm2 logs monster-ai --lines 100
   tail -f /var/log/nginx/error.log
   ```

### Backups

1. **Backup .env.ultimate:**
   ```bash
   cp .env.ultimate .env.ultimate.backup
   ```

2. **Backup entire project:**
   ```bash
   tar -czf monster-ai-backup-$(date +%Y%m%d).tar.gz /path/to/monster-ai
   ```

3. **Automate backups:**
   ```bash
   crontab -e
   # Add: 0 2 * * * /path/to/backup-script.sh
   ```

---

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
pm2 logs monster-ai
```

**Common issues:**
- Missing dependencies: `npm install`
- Wrong Node version: `node --version`
- Port in use: `lsof -i :5001`

### Can't Access from Browser

1. **Check server is running:**
   ```bash
   pm2 status
   netstat -tulpn | grep 5001
   ```

2. **Check firewall:**
   ```bash
   sudo ufw status
   ```

3. **Check Nginx:**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

### SSL Certificate Issues

**Renew manually:**
```bash
sudo certbot renew
```

**Check certificate:**
```bash
sudo certbot certificates
```

### High Memory Usage

**Set memory limit:**
```bash
pm2 start server-ultimate.js --max-memory-restart 500M
```

### PM2 Not Starting on Boot

**Reconfigure startup:**
```bash
pm2 unstartup
pm2 startup
# Run the command it displays
pm2 save
```

---

## Cost Estimates

### Hostinger VPS Pricing

- **KVM 1**: $5.99/month - 1 core, 2GB RAM
- **KVM 2**: $7.99/month - 2 cores, 4GB RAM
- **KVM 4**: $13.99/month - 4 cores, 8GB RAM

### Total Monthly Cost

- **Hosting**: $5.99-$13.99
- **Domain**: ~$10/year ($0.83/month)
- **SSL**: Free (Let's Encrypt)
- **API Usage**: Varies (see BEAST_EDITION_GUIDE.md)

**Estimated Total**: $7-15/month

---

## Next Steps

✅ **Server deployed!**
✅ **SSL configured!**
✅ **Domain working!**

**What's Next:**

1. **Test all features thoroughly**
2. **Setup monitoring and alerts**
3. **Configure backups**
4. **Optimize performance**
5. **Share with the world!**

---

**Built by Kings From Earth Development 👑**

For more help, see:
- TROUBLESHOOTING.md
- WINDOWS_SETUP.md
- AUTOMATION_GUIDE.md
