# 🔥 Monster Super AI Voice Assistant Setup Guide

Complete guide to enable voice-to-text integration with Claude Code on Windows startup.

## 🎯 Features

- **Real-time voice interaction** with Claude AI
- **Automatic startup** with Windows
- **Conversation memory** across the session
- **Firecrawl MCP integration** for web scraping capabilities
- **Session logging** for review and debugging
- **Hands-free coding** assistance

## 📋 Prerequisites

### 1. Python Installation

Download and install Python 3.8 or higher from [python.org](https://www.python.org/downloads/)

**IMPORTANT**: During installation, check "Add Python to PATH"

Verify installation:
```cmd
python --version
```

### 2. Claude API Key

1. Sign up for Claude Pro at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys section
3. Create a new API key
4. Copy and save it securely

### 3. Audio Setup

Ensure you have:
- A working microphone
- Speakers or headphones
- Windows audio drivers installed

## 🚀 Quick Start Installation

### Step 1: Clone or Navigate to Repository

```cmd
cd path\to\firecrawl-mcp-server
```

### Step 2: Install Python Dependencies

```cmd
python -m pip install -r requirements.txt
```

If you encounter errors with `pyaudio`, install it separately:
```cmd
pip install pipwin
pipwin install pyaudio
```

### Step 3: Configure API Key

**Option A: Using .env file (Recommended)**

1. Copy the example file:
   ```cmd
   copy .env.example .env
   ```

2. Edit `.env` and add your API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```

**Option B: Enter manually each time**

Skip this step - you'll be prompted when you run the assistant.

### Step 4: Test the Voice Assistant

```cmd
start-voice-assistant.bat
```

You should see:
```
🔥 MONSTER SUPER AI VOICE INTERFACE
====================================
Session started: 2025-11-22 10:30:00
====================================

🤖 Claude: Monster Super AI activated...
🎤 Listening... (speak now)
```

### Step 5: Install to Windows Startup (Optional)

To automatically start the voice assistant when Windows starts:

```cmd
install-startup.bat
```

This creates a shortcut in your Startup folder.

## 🎤 Usage Guide

### Starting the Assistant

**Manual Start:**
```cmd
start-voice-assistant.bat
```

**Auto-start:**
After running `install-startup.bat`, it will launch automatically on login.

### Voice Commands

The assistant responds to natural language. Examples:

**General Conversation:**
- "Hey Claude, explain what async functions are"
- "Write a Python function to calculate factorial"
- "What's the difference between let and const in JavaScript?"

**Coding Help:**
- "Help me debug this error: TypeError undefined is not a function"
- "Write a React component for a todo list"
- "Explain how to use git rebase"

**Web Scraping (with Firecrawl):**
- "Scrape the content from example.com"
- "Extract all links from a webpage"
- "Get me the latest news headlines"

**Session Management:**
- "Clear history" - Reset conversation
- "Exit" or "Goodbye" - Close assistant

### Tips for Best Results

1. **Speak clearly** and at a normal pace
2. **Wait for the beep** before speaking (if enabled)
3. **Use specific requests** for better responses
4. **Review session logs** in `voice-session.log`

## ⚙️ Configuration

### Voice Settings

Edit `voice-assistant.py` to customize:

```python
# Line ~37-39
self.tts_engine.setProperty('rate', 175)    # Speed: 100-200
self.tts_engine.setProperty('volume', 0.95)  # Volume: 0.0-1.0
```

### Recognition Timeout

```python
# Line ~102
audio = self.recognizer.listen(source, timeout=10, phrase_time_limit=20)
```

- `timeout`: Seconds to wait for speech to start
- `phrase_time_limit`: Maximum seconds for a single phrase

## 🔧 Troubleshooting

### Issue: "No module named 'anthropic'"

**Solution:**
```cmd
pip install anthropic
```

### Issue: "Could not find PyAudio"

**Solution (Windows):**
```cmd
pip install pipwin
pipwin install pyaudio
```

**Alternative:**
Download wheel from [unofficial binaries](https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyaudio)

### Issue: "Speech service unavailable"

**Causes:**
- No internet connection (Google Speech Recognition requires internet)
- Firewall blocking speech service

**Solution:**
- Check internet connection
- Allow Python through Windows Firewall

### Issue: Microphone not detected

**Solution:**
1. Check Windows Sound Settings
2. Set correct default microphone
3. Grant microphone permissions to Python

### Issue: "API Error: Invalid API key"

**Solution:**
1. Verify your API key is correct in `.env`
2. Ensure no extra spaces or quotes around the key
3. Check your API key is active at console.anthropic.com

### Issue: Voice sounds robotic or wrong

**Solution:**
Change voice in `voice-assistant.py`:
```python
voices = self.tts_engine.getProperty('voices')
for i, voice in enumerate(voices):
    print(f"{i}: {voice.name}")

# Then set specific voice:
self.tts_engine.setProperty('voice', voices[1].id)  # Try different numbers
```

## 🔄 Updating

Pull latest changes:
```cmd
git pull origin main
pip install -r requirements.txt
```

## 🗑️ Uninstallation

### Remove from Startup

```cmd
uninstall-startup.bat
```

### Complete Removal

```cmd
pip uninstall anthropic SpeechRecognition pyttsx3 pyaudio
```

## 📁 File Structure

```
firecrawl-mcp-server/
├── voice-assistant.py           # Main voice assistant script
├── start-voice-assistant.bat    # Windows launcher
├── install-startup.bat          # Install to startup
├── uninstall-startup.bat        # Remove from startup
├── requirements.txt             # Python dependencies
├── .env                         # Your API keys (create this)
├── .env.example                 # Template for .env
├── voice-session.log            # Conversation history
└── VOICE_SETUP.md              # This guide
```

## 🔐 Security Notes

- **Never commit `.env` file** to version control
- Keep your API keys secure
- Review `voice-session.log` before sharing
- Monitor your API usage at console.anthropic.com

## 🎨 Advanced: Integration with Holographic UI

Want to integrate with a custom UI? The Python script can be modified to:

1. **WebSocket Server**: Stream audio/text to web interface
2. **REST API**: Expose endpoints for external control
3. **Waveform Visualization**: Send audio levels for visual feedback

Example WebSocket integration:
```python
import asyncio
import websockets

async def handle_client(websocket, path):
    async for message in websocket:
        response = self.chat_with_claude(message)
        await websocket.send(response)
```

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/firecrawl/firecrawl-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/firecrawl/firecrawl-mcp-server/discussions)
- **Claude API**: [Anthropic Support](https://support.anthropic.com)

## 🎯 Next Steps

1. **Customize the voice** to your preference
2. **Add custom wake words** (e.g., "Hey Monster AI")
3. **Integrate with your IDE** for inline code suggestions
4. **Build a GUI** with your 4D parallax effects
5. **Add Firecrawl capabilities** for web scraping

## 💡 Pro Tips

- **Keyboard shortcuts**: Create AutoHotkey scripts to toggle listening
- **Multiple assistants**: Run different instances for different tasks
- **Custom commands**: Add special triggers for common workflows
- **Session templates**: Pre-load context for specific projects

---

**Built with ❤️ for the Monster Super AI vision**

Ready to code with your voice? Let's go! 🚀
