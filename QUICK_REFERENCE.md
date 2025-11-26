# 🔥 MONSTER SUPER AI - QUICK REFERENCE

## ⚡ Super Quick Start

```bash
# 1. Install (one-time)
npm install

# 2. Start server
node server-ultimate.js

# 3. Open in browser
monster-ai-ultimate-v2.html
```

---

## 📋 Service Toggle Quick Guide

### In Browser Interface:

| Button | What It Does |
|--------|--------------|
| **🔍 Web Search** | ON = Uses Tavily for real-time web info |
| **🔊 Voice** | ON = Uses Cartesia to speak responses |
| **📡 LiveKit** | ON = Real-time audio/video communication |
| **AI Model Dropdown** | Switch between Claude & GPT-4 |

---

## 🎙️ Voice Commands

1. Click **cyan orb (🎤)** to start listening
2. Speak your message
3. AI transcribes and responds
4. Enable **Voice toggle** to hear responses

---

## 🔑 API Keys Location

All in `.env.ultimate`:
- LiveKit
- OpenAI
- Deepgram
- Cartesia
- Tavily
- Anthropic

**⚠️ NEVER commit this file to GitHub!**

---

## 🌐 URLs

**Local Development:**
```
http://localhost:5001
```

**Your Live Site (after deploy):**
```
https://supermonsterai.kingsfromearthdevelopment.com
```

---

## 🎯 When to Use Each AI

### Claude Sonnet 4.5 ✅
- Code generation
- Complex reasoning
- Long technical explanations
- Debugging help

### GPT-4 Turbo ✅
- Creative writing
- General conversation
- Quick answers
- Brainstorming

### With Web Search ✅
- Current events
- Recent data
- Research tasks
- Fact-checking

---

## 🐛 Common Issues

### Server won't start
```bash
# Check if Node.js installed
node --version

# If not, install from nodejs.org
```

### Port 5001 in use
```bash
# Windows: Find and kill process
netstat -ano | findstr :5001

# Or change PORT in .env.ultimate
```

### Can't hear voice
- Enable "🔊 Voice" toggle
- Check browser volume
- Verify Cartesia API key

### Mic not working
- Allow browser microphone permission
- Use HTTPS or localhost
- Try Chrome/Edge

---

## 📊 File Sizes

- `monster-ai-ultimate-v2.html`: ~65KB
- `server-ultimate.js`: ~15KB
- Total: ~80KB (super fast!)

---

## 💡 Pro Tips

1. **For Code**: Use Claude + disable web search
2. **For Research**: Enable web search + use either AI
3. **For Voice Chat**: Enable voice output + LiveKit
4. **For Speed**: Disable web search when not needed

---

## 🎨 Keyboard Shortcuts

- **Enter**: Send message
- **Shift+Enter**: New line in message
- **Esc**: Stop voice input

---

## 🔥 Best Practices

✅ Enable web search for current events
✅ Use Claude for coding tasks
✅ Use GPT-4 for creative tasks
✅ Clear chat periodically for speed
✅ Export important conversations
✅ Monitor API usage on dashboards

---

## 📞 Emergency Troubleshooting

1. **Restart server** (Ctrl+C, then restart)
2. **Clear browser cache**
3. **Check console** (F12 in browser)
4. **Verify API keys** in `.env.ultimate`
5. **Read full guide**: `BEAST_EDITION_GUIDE.md`

---

## 🎯 Testing Checklist

After starting:
- [ ] Server shows "Running on port 5001"
- [ ] All 6 services show as active
- [ ] Can send text message
- [ ] Can use voice input
- [ ] Can toggle voice output
- [ ] Web search works when enabled
- [ ] Can switch AI models
- [ ] Export downloads file

---

## 🚀 Deploy to Production

See `BEAST_EDITION_GUIDE.md` section "Deploying to Hostinger"

Quick steps:
1. Upload files to server
2. Run `npm install`
3. Start with `node server-ultimate.js`
4. Configure domain
5. Enable SSL

---

## 📈 Performance Expectations

**Response Times:**
- Text only: 1-3 seconds
- With web search: 3-5 seconds
- Voice synthesis: +1-2 seconds
- LiveKit: Real-time (<100ms)

**Browser Support:**
- Chrome/Edge: ⭐⭐⭐⭐⭐
- Safari: ⭐⭐⭐⭐
- Firefox: ⭐⭐⭐

---

## 🎬 Intro Sequence

**Duration**: 13 seconds

**Can skip**: Click "Skip Intro ⏭️"

**Phases**:
1. Elevator rise (0-5s)
2. Door layer 1 (5-7s)
3. Door layer 2 (7-9s)
4. Door layer 3 (9-10.5s)
5. Hologram (10.5-13s)

---

## 💰 Cost Tracking

Monitor usage at:
- Claude: console.anthropic.com
- OpenAI: platform.openai.com/usage
- Deepgram: console.deepgram.com
- Cartesia: play.cartesia.ai
- Tavily: app.tavily.com
- LiveKit: cloud.livekit.io

---

## ⚙️ Quick Config

**Change server port:**
Edit `.env.ultimate` → `PORT=5001`

**Change intro duration:**
Edit line ~1170 in HTML → `setTimeout(skipIntro, 13000)`

**Change particle count:**
Edit lines ~1093, ~1104 in HTML

---

## 📱 Mobile Access

Works on mobile browsers!

**iOS**: Safari recommended
**Android**: Chrome recommended

**Note**: Voice features may be limited on mobile

---

## 🔒 Security Reminders

⚠️ **NEVER commit `.env.ultimate` to GitHub**
⚠️ **Use HTTPS in production**
⚠️ **Rotate API keys regularly**
⚠️ **Monitor API usage**
⚠️ **Set up rate limiting in production**

---

## 🎉 You're Ready!

**Start server** → **Open HTML** → **Experience the BEAST!** 🔥

For full details, see `BEAST_EDITION_GUIDE.md` 📖

---

**Built by Kings From Earth Development** 👑
**Powered by 6 AI Services** 🤖
**This is MONSTER SUPER AI BEAST!** 🔥
