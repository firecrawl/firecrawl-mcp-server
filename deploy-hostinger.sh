#!/bin/bash
# Monster Super AI - Hostinger Server Setup Script
# Automates server configuration and deployment
# Built by Kings From Earth Development

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${YELLOW}     $1${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[+] $1${NC}"
}

print_error() {
    echo -e "${RED}[!] ERROR: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] WARNING: $1${NC}"
}

print_info() {
    echo -e "${CYAN}[*] $1${NC}"
}

# Main deployment
print_header "Monster Super AI - Hostinger Deployment"

print_info "Starting automated server setup..."
echo ""

# Step 1: Check system
print_info "[1/10] Checking system information..."
print_info "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'=' -f2 | tr -d '\"')"
print_info "User: $(whoami)"
print_info "Directory: $(pwd)"
echo ""

# Step 2: Update system packages
print_info "[2/10] Updating system packages..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    print_success "Package list updated"
elif command -v yum &> /dev/null; then
    sudo yum update -y -q
    print_success "Package list updated"
else
    print_warning "Package manager not recognized, skipping system update"
fi
echo ""

# Step 3: Install Node.js (if not installed)
print_info "[3/10] Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is already installed: $NODE_VERSION"
else
    print_warning "Node.js not found! Installing Node.js LTS..."

    # Install Node.js using NodeSource repository
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
        sudo yum install -y nodejs
    else
        print_error "Could not install Node.js automatically"
        print_info "Please install Node.js manually: https://nodejs.org"
        exit 1
    fi

    if command -v node &> /dev/null; then
        print_success "Node.js installed successfully: $(node --version)"
    else
        print_error "Node.js installation failed"
        exit 1
    fi
fi
echo ""

# Step 4: Install npm dependencies
print_info "[4/10] Installing npm dependencies..."
if [ -f "package.json" ]; then
    npm install --production
    print_success "Dependencies installed successfully"
else
    print_warning "package.json not found, skipping dependency installation"
fi
echo ""

# Step 5: Setup environment file
print_info "[5/10] Setting up environment configuration..."
if [ ! -f ".env.ultimate" ]; then
    if [ -f ".env.ultimate.example" ]; then
        cp .env.ultimate.example .env.ultimate
        print_success "Created .env.ultimate from example"
        print_warning "IMPORTANT: You must edit .env.ultimate and add your API keys!"
        print_info "Run: nano .env.ultimate"
    else
        print_error ".env.ultimate.example not found!"
        exit 1
    fi
else
    print_success ".env.ultimate already exists"
fi
echo ""

# Step 6: Install PM2 (Process Manager)
print_info "[6/10] Installing PM2 process manager..."
if command -v pm2 &> /dev/null; then
    print_success "PM2 is already installed: $(pm2 --version)"
else
    sudo npm install -g pm2
    print_success "PM2 installed successfully"
fi
echo ""

# Step 7: Configure PM2
print_info "[7/10] Configuring PM2..."
if [ -f "server-ultimate.js" ]; then
    # Stop existing instance if running
    pm2 stop monster-ai 2>/dev/null || true
    pm2 delete monster-ai 2>/dev/null || true

    # Start new instance
    pm2 start server-ultimate.js --name monster-ai --time
    print_success "Monster AI server started with PM2"

    # Save PM2 configuration
    pm2 save
    print_success "PM2 configuration saved"
else
    print_error "server-ultimate.js not found!"
    exit 1
fi
echo ""

# Step 8: Setup PM2 startup
print_info "[8/10] Configuring PM2 auto-start..."
pm2 startup | grep "sudo" | bash || true
pm2 save
print_success "PM2 will auto-start on system boot"
echo ""

# Step 9: Configure firewall (if UFW is available)
print_info "[9/10] Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 5001/tcp comment "Monster Super AI"
    print_success "Firewall configured for port 5001"
else
    print_warning "UFW not available, skipping firewall configuration"
    print_info "Make sure port 5001 is open in your hosting control panel"
fi
echo ""

# Step 10: Install and configure Nginx (optional)
print_info "[10/10] Checking for Nginx..."
if command -v nginx &> /dev/null; then
    print_success "Nginx is installed"

    # Create Nginx configuration
    print_info "Creating Nginx configuration..."

    DOMAIN="${DOMAIN:-localhost}"

    sudo tee /etc/nginx/sites-available/monster-ai > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://\$server_name\$request_uri;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/monster-ai /etc/nginx/sites-enabled/ 2>/dev/null || true

    # Test configuration
    if sudo nginx -t 2>/dev/null; then
        sudo systemctl reload nginx
        print_success "Nginx configured successfully"
        print_info "You can now access via: http://$DOMAIN"
    else
        print_warning "Nginx configuration test failed"
        print_info "You may need to configure Nginx manually"
    fi
else
    print_warning "Nginx not installed"
    print_info "Install with: sudo apt install nginx"
    print_info "Direct access available at: http://YOUR_SERVER_IP:5001"
fi
echo ""

# Display summary
print_header "Deployment Complete!"

print_success "Monster Super AI is now running on your server!"
echo ""

print_info "Server Status:"
pm2 status
echo ""

print_info "Access URLs:"
print_info "  - Direct: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP'):5001"
if command -v nginx &> /dev/null; then
    print_info "  - Via Nginx: http://$DOMAIN"
fi
echo ""

print_info "Next Steps:"
echo ""
echo "  1. Edit your API keys:"
echo "     nano .env.ultimate"
echo ""
echo "  2. Restart the server:"
echo "     pm2 restart monster-ai"
echo ""
echo "  3. View logs:"
echo "     pm2 logs monster-ai"
echo ""
echo "  4. Setup SSL certificate (for HTTPS):"
echo "     sudo apt install certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d $DOMAIN"
echo ""
echo "  5. Monitor server:"
echo "     pm2 monit"
echo ""

print_info "Useful PM2 Commands:"
echo "  pm2 status           - Check server status"
echo "  pm2 restart monster-ai   - Restart server"
echo "  pm2 stop monster-ai      - Stop server"
echo "  pm2 logs monster-ai      - View logs"
echo "  pm2 monit            - Monitor in real-time"
echo ""

print_header "Setup Complete!"

print_success "Your Monster Super AI BEAST Edition is ready!"
print_info "Built by Kings From Earth Development"
echo ""

exit 0
