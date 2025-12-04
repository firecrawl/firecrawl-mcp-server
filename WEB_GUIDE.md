# 🌐 Monster Super AI - Web Interface Guide

Access your voice-enabled Claude assistant from any web browser!

## 🚀 Quick Start

### 1. Start the Server

```bash
./start-web.sh
```

Or manually:

```bash
python3 web-server.py
```

### 2. Open Your Browser

Navigate to:
- **http://localhost:5000**
- **http://127.0.0.1:5000**

### 3. Start Talking!

Click the blue voice orb 🎤 and start speaking, or type your message in the text box.

## ✨ Features

### Voice Controls

- **Click the orb** to start/stop voice recognition
- **Automatic speech-to-text** using Web Speech API (built into Chrome/Edge)
- **Text-to-speech responses** - Claude speaks back to you!
- **Visual feedback** - The orb pulses when listening

### Text Input

- Type messages directly in the input box
- Press **Enter** to send
- Full conversation history maintained

### Controls

- **Send** - Submit your message
- **Clear** - Reset conversation history
- **Status indicators** - See API connection status

## 🎨 Interface Features

### The Voice Orb

- **Blue pulsing animation** when listening
- **Hover effect** for visual feedback
- **Click to toggle** voice input on/off

### Message Display

- **User messages** - Blue boxes on the right
- **Claude responses** - Cyan boxes on the left
- **Auto-scroll** to latest messages
- **Smooth animations** for new messages

### Status Panel

- **API Status** - Shows connection to Claude API
- **Message Count** - Track conversation length
- **Real-time updates** - Status checks every 30 seconds

## 🎤 How to Use Voice

### Chrome/Edge (Recommended)

1. Click the voice orb
2. Allow microphone access when prompted
3. Speak your message clearly
4. The orb will pulse while listening
5. Your speech is automatically transcribed and sent

### Safari

Works with Web Speech API - click orb and speak

### Firefox

Voice input may not be available. Use text input instead.

## 💬 Example Interactions

### Coding Help

**You:** "Write a Python function to check if a number is prime"

**Claude:** *Provides code and explanation, spoken aloud*

### Debugging

**You:** "Help me fix this error: TypeError undefined is not a function"

**Claude:** *Analyzes and suggests solutions*

### Web Scraping (with Firecrawl)

**You:** "Scrape the content from example.com"

**Claude:** *Uses Firecrawl MCP to fetch and process content*

### General Conversation

**You:** "Explain what async/await means in JavaScript"

**Claude:** *Provides clear explanation*

## ⚙️ Configuration

### API Key

Set your Claude API key in `.env`:

```bash
ANTHROPIC_API_KEY=your-key-here
```

### Port Configuration

Default port is 5000. To change:

Edit `web-server.py`:
```python
app.run(host='0.0.0.0', port=8080, debug=True)  # Change 8080 to your port
```

### Model Selection

Change the Claude model in `web-server.py`:
```python
model="claude-sonnet-4-20250514",  # Current
# model="claude-opus-4-20250514",  # For more powerful responses
```

## 🔧 Troubleshooting

### "API key not configured"

**Solution:**
1. Check `.env` file exists
2. Verify `ANTHROPIC_API_KEY` is set correctly
3. Restart the server

### Microphone not working

**Solution:**
1. Check browser permissions (usually shows prompt)
2. Ensure you're using Chrome, Edge, or Safari
3. Try HTTPS if on remote server
4. Use text input as fallback

### Server won't start

**Solution:**
```bash
# Check if port is already in use
lsof -i :5000

# Install missing dependencies
pip3 install -r requirements.txt --user
```

### "Speech recognition not supported"

**Solution:**
- Use Chrome, Edge, or Safari
- Firefox doesn't support Web Speech API well
- Use text input as alternative

### No audio output

**Solution:**
1. Check browser audio settings
2. Unmute the tab
3. Check system volume
4. Try refreshing the page

## 🌍 Remote Access

### Local Network Access

The server runs on `0.0.0.0`, accessible from other devices on your network:

1. Find your local IP:
   ```bash
   ip addr show  # Linux
   ipconfig      # Windows
   ```

2. Access from another device:
   ```
   http://YOUR_IP:5000
   ```

### Public Access (Advanced)

**⚠️ Security Warning:** Only expose publicly with proper authentication!

#### Using ngrok

```bash
# Install ngrok
npm install -g ngrok

# Start tunnel
ngrok http 5000
```

#### Using SSH Tunnel

```bash
ssh -R 80:localhost:5000 serveo.net
```

## 📱 Mobile Access

The interface is fully responsive and works on mobile browsers:

1. Connect phone to same WiFi
2. Open browser
3. Navigate to `http://YOUR_COMPUTER_IP:5000`
4. Add to home screen for app-like experience

**Voice input works great on mobile!**

## 🎯 Keyboard Shortcuts

- **Enter** - Send message
- **Ctrl+L** - Focus on input box (browser default)

## 🔐 Security

### Best Practices

1. **Never commit `.env`** - Contains your API key
2. **Use HTTPS** for remote access
3. **Add authentication** if exposing publicly
4. **Monitor API usage** at console.anthropic.com

### Session Management

- Each browser session gets unique ID
- Conversations isolated per session
- History stored in server memory (not persistent)

## 📊 Monitoring

### Session Logs

All conversations logged to `web-session.log`:

```bash
tail -f web-session.log
```

### Server Status

Check API endpoint:
```bash
curl http://localhost:5000/api/status
```

Response:
```json
{
  "status": "online",
  "api_configured": true,
  "active_sessions": 2,
  "timestamp": "2025-11-22T10:30:00"
}
```

## 🚀 Advanced Usage

### Custom System Prompts

Edit `web-server.py`:
```python
system="You are Monster Super AI, a helpful voice-enabled coding assistant..."
```

### Add Authentication

```python
from flask_httpauth import HTTPBasicAuth
auth = HTTPBasicAuth()

@auth.verify_password
def verify_password(username, password):
    return username == "admin" and password == "secret"

@app.route('/')
@auth.login_required
def index():
    return render_template('index.html')
```

### WebSocket Support (Real-time streaming)

For advanced streaming responses, consider adding Flask-SocketIO.

## 🎨 Customization

### Change Colors

Edit `web/templates/index.html` CSS:
```css
/* Change primary color from cyan to purple */
--primary-color: #aa00ff;
```

### Add Custom Animations

Modify the `.voice-orb` animation or add your own effects.

### Branding

Update the header text, logo, and styling to match your brand.

## 📈 Performance

### Optimization Tips

1. **Use production WSGI server** (gunicorn, waitress)
2. **Enable caching** for static files
3. **Rate limiting** to prevent abuse
4. **Load balancing** for multiple users

### Production Deployment

```bash
# Install gunicorn
pip3 install gunicorn

# Run production server
gunicorn -w 4 -b 0.0.0.0:5000 web-server:app
```

## 🔄 Updates

Pull latest changes:
```bash
git pull origin main
pip3 install -r requirements.txt --user
```

Restart server:
```bash
# Stop current server (Ctrl+C)
# Start again
./start-web.sh
```

## 🆚 Web vs Desktop Version

| Feature | Web Interface | Desktop Python |
|---------|--------------|----------------|
| **Platform** | Any browser | Python required |
| **Voice Input** | Web Speech API | Google Speech Recognition |
| **Voice Output** | Browser TTS | pyttsx3 |
| **Installation** | Flask only | pyaudio, pyttsx3 |
| **Mobile Support** | ✅ Yes | ❌ No |
| **Remote Access** | ✅ Easy | ⚠️ Complex |
| **Startup Speed** | ⚡ Fast | 🐢 Slower |

## 🎯 Next Steps

1. ✅ Customize the UI colors and branding
2. ✅ Add authentication for security
3. ✅ Deploy to production with gunicorn
4. ✅ Add WebSocket for streaming responses
5. ✅ Integrate with your holographic 4D UI
6. ✅ Add custom voice commands/triggers

## 💡 Tips & Tricks

### Clear Conversations Regularly

Use the "Clear" button to reset when starting new topics.

### Speak Clearly

- Normal pace works best
- Minimize background noise
- Use a good microphone

### Mobile Optimization

Add to home screen on iOS/Android for full-screen app experience.

### Debug Mode

Check browser console (F12) for detailed logs and errors.

---

**Built with ❤️ for the Monster Super AI vision**

🔥 Ready to code with your voice? Open http://localhost:5000 and let's go! 🚀
