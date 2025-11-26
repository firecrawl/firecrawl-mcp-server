/**
 * Monster Super AI Ultimate - Multi-Service Backend
 * Integrates: LiveKit, OpenAI, Deepgram, Cartesia, Tavily, and Claude
 * Built by Kings From Earth Development
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createClient } from '@deepgram/sdk';
import axios from 'axios';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

// Load environment variables
dotenv.config({ path: '.env.ultimate' });

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize AI Services
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// LiveKit Configuration
const livekitHost = process.env.LIVEKIT_URL;
const roomService = new RoomServiceClient(
    livekitHost,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
);

// In-memory conversation history
const conversations = new Map();

/**
 * Health Check Endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        services: {
            claude: !!process.env.ANTHROPIC_API_KEY,
            openai: !!process.env.OPENAI_API_KEY,
            deepgram: !!process.env.DEEPGRAM_API_KEY,
            cartesia: !!process.env.CARTESIA_API_KEY,
            tavily: !!process.env.TAVILY_API_KEY,
            livekit: !!process.env.LIVEKIT_API_KEY
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * LiveKit: Generate Access Token
 */
app.post('/api/livekit/token', async (req, res) => {
    try {
        const { roomName, participantName } = req.body;

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: participantName || 'user-' + Date.now(),
            }
        );

        at.addGrant({
            room: roomName || 'monster-ai-room',
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
        });

        const token = at.toJwt();

        res.json({
            token,
            url: process.env.LIVEKIT_URL,
            roomName: roomName || 'monster-ai-room'
        });
    } catch (error) {
        console.error('LiveKit token error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Claude: Chat Completion
 */
app.post('/api/claude/chat', async (req, res) => {
    try {
        const { message, conversationId = 'default', systemPrompt } = req.body;

        if (!conversations.has(conversationId)) {
            conversations.set(conversationId, []);
        }

        const history = conversations.get(conversationId);
        history.push({
            role: 'user',
            content: message
        });

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 8096,
            system: systemPrompt || 'You are Monster AI, an advanced AI assistant with voice capabilities. Be helpful, creative, and engaging.',
            messages: history
        });

        const assistantMessage = response.content[0].text;

        history.push({
            role: 'assistant',
            content: assistantMessage
        });

        res.json({
            response: assistantMessage,
            conversationId,
            model: 'claude-sonnet-4.5',
            usage: response.usage
        });
    } catch (error) {
        console.error('Claude error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * OpenAI: Chat Completion
 */
app.post('/api/openai/chat', async (req, res) => {
    try {
        const { message, conversationId = 'default', model = 'gpt-4-turbo-preview' } = req.body;

        if (!conversations.has(conversationId)) {
            conversations.set(conversationId, []);
        }

        const history = conversations.get(conversationId);
        history.push({
            role: 'user',
            content: message
        });

        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are Monster AI, a powerful AI assistant with advanced capabilities.'
                },
                ...history
            ]
        });

        const assistantMessage = completion.choices[0].message.content;

        history.push({
            role: 'assistant',
            content: assistantMessage
        });

        res.json({
            response: assistantMessage,
            conversationId,
            model: model,
            usage: completion.usage
        });
    } catch (error) {
        console.error('OpenAI error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Deepgram: Speech-to-Text
 */
app.post('/api/deepgram/transcribe', async (req, res) => {
    try {
        const { audioUrl, audioData } = req.body;

        let response;
        if (audioUrl) {
            response = await deepgram.listen.prerecorded.transcribeUrl(
                { url: audioUrl },
                {
                    model: 'nova-2',
                    smart_format: true,
                    punctuate: true,
                    diarize: true
                }
            );
        } else if (audioData) {
            const buffer = Buffer.from(audioData, 'base64');
            response = await deepgram.listen.prerecorded.transcribeFile(
                buffer,
                {
                    model: 'nova-2',
                    smart_format: true,
                    punctuate: true,
                    diarize: true
                }
            );
        } else {
            return res.status(400).json({ error: 'No audio source provided' });
        }

        const transcript = response.results.channels[0].alternatives[0].transcript;

        res.json({
            transcript,
            confidence: response.results.channels[0].alternatives[0].confidence,
            words: response.results.channels[0].alternatives[0].words
        });
    } catch (error) {
        console.error('Deepgram error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Cartesia: Text-to-Speech
 */
app.post('/api/cartesia/speak', async (req, res) => {
    try {
        const { text, voiceId = 'default', speed = 1.0 } = req.body;

        const response = await axios.post('https://api.cartesia.ai/tts/bytes', {
            model_id: 'sonic-english',
            transcript: text,
            voice: {
                mode: 'id',
                id: voiceId
            },
            output_format: {
                container: 'mp3',
                encoding: 'mp3',
                sample_rate: 44100
            },
            language: 'en'
        }, {
            headers: {
                'X-API-Key': process.env.CARTESIA_API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });

        const audioBase64 = Buffer.from(response.data).toString('base64');

        res.json({
            audio: audioBase64,
            format: 'mp3',
            sampleRate: 44100
        });
    } catch (error) {
        console.error('Cartesia error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Tavily: Web Search
 */
app.post('/api/tavily/search', async (req, res) => {
    try {
        const { query, maxResults = 5, searchDepth = 'advanced' } = req.body;

        const response = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: query,
            max_results: maxResults,
            search_depth: searchDepth,
            include_answer: true,
            include_images: true
        });

        res.json({
            answer: response.data.answer,
            results: response.data.results,
            images: response.data.images,
            query: query
        });
    } catch (error) {
        console.error('Tavily error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Multi-Modal Chat: Combines Claude/OpenAI with Web Search
 */
app.post('/api/chat/multimodal', async (req, res) => {
    try {
        const { message, useSearch = false, aiModel = 'claude' } = req.body;

        let context = '';

        // If search is enabled, get web context first
        if (useSearch) {
            const searchResponse = await axios.post('https://api.tavily.com/search', {
                api_key: process.env.TAVILY_API_KEY,
                query: message,
                max_results: 3,
                search_depth: 'advanced',
                include_answer: true
            });

            context = `\n\nWeb Search Context:\n${searchResponse.data.answer}\n\nTop Results:\n`;
            searchResponse.data.results.slice(0, 3).forEach((result, i) => {
                context += `${i + 1}. ${result.title}: ${result.content}\n`;
            });
        }

        const enhancedMessage = context ? `${message}\n${context}` : message;

        // Route to appropriate AI model
        let aiResponse;
        if (aiModel === 'openai') {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: 'You are Monster AI. Use the provided web search context when available.'
                    },
                    {
                        role: 'user',
                        content: enhancedMessage
                    }
                ]
            });
            aiResponse = completion.choices[0].message.content;
        } else {
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 8096,
                messages: [{
                    role: 'user',
                    content: enhancedMessage
                }]
            });
            aiResponse = response.content[0].text;
        }

        res.json({
            response: aiResponse,
            searchUsed: useSearch,
            model: aiModel
        });
    } catch (error) {
        console.error('Multimodal chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Clear conversation history
 */
app.post('/api/conversation/clear', (req, res) => {
    const { conversationId } = req.body;

    if (conversationId) {
        conversations.delete(conversationId);
    } else {
        conversations.clear();
    }

    res.json({ success: true, message: 'Conversation cleared' });
});

/**
 * Get conversation history
 */
app.get('/api/conversation/:id', (req, res) => {
    const { id } = req.params;
    const history = conversations.get(id) || [];

    res.json({
        conversationId: id,
        messages: history,
        messageCount: history.length
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          🔥 MONSTER SUPER AI ULTIMATE 🔥                 ║
║                                                           ║
║  Multi-Service AI Platform Running                       ║
║                                                           ║
║  Server: http://localhost:${PORT}                       ║
║                                                           ║
║  Services Active:                                         ║
║  ✅ LiveKit (Real-time Audio/Video)                      ║
║  ✅ Claude Sonnet 4.5 (Anthropic)                        ║
║  ✅ GPT-4 Turbo (OpenAI)                                 ║
║  ✅ Deepgram (Speech-to-Text)                            ║
║  ✅ Cartesia (Voice Synthesis)                           ║
║  ✅ Tavily (Web Search)                                  ║
║                                                           ║
║  Built by Kings From Earth Development 👑                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

export default app;
