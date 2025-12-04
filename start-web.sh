#!/bin/bash

# Monster Super AI Web Server Startup Script

echo "========================================================================"
echo "🔥 MONSTER SUPER AI - WEB INTERFACE"
echo "========================================================================"
echo ""

# Check if .env exists and has API key
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating .env file..."
    cp .env.example .env
    echo ""
    echo "Please edit .env and add your ANTHROPIC_API_KEY"
    exit 1
fi

# Check if API key is set
if ! grep -q "ANTHROPIC_API_KEY=sk-" .env 2>/dev/null; then
    echo "⚠️  WARNING: ANTHROPIC_API_KEY not set in .env file"
    echo ""
    echo "Please edit .env and add your Claude API key:"
    echo "  nano .env"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Starting web server..."
echo "========================================================================"
echo ""
echo "🌐 Access the interface at:"
echo "   http://localhost:5000"
echo "   http://127.0.0.1:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================================================"
echo ""

# Start the Flask server
python3 web-server.py
