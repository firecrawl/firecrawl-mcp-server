#!/usr/bin/env python3
"""
Monster Super AI Web Server
Web-based voice interface for Claude Code
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import anthropic
import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__,
            static_folder='web/static',
            template_folder='web/templates')
CORS(app)

# Store conversation history per session
sessions = {}

class ClaudeAssistant:
    """Claude API wrapper for web interface"""

    def __init__(self, api_key):
        self.client = anthropic.Anthropic(api_key=api_key)

    def chat(self, message, session_id, conversation_history=None):
        """Send message to Claude and get response"""
        if conversation_history is None:
            conversation_history = []

        # Add user message
        conversation_history.append({
            "role": "user",
            "content": message
        })

        try:
            # Call Claude API
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                temperature=1.0,
                system="You are Monster Super AI, a helpful voice-enabled coding assistant. Keep responses concise and conversational since they will be spoken aloud.",
                messages=conversation_history
            )

            # Extract response
            claude_response = response.content[0].text

            # Add to history
            conversation_history.append({
                "role": "assistant",
                "content": claude_response
            })

            return claude_response, conversation_history

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"Claude API Error: {error_msg}")
            return error_msg, conversation_history


# Initialize Claude assistant
api_key = os.getenv('ANTHROPIC_API_KEY')
if not api_key:
    print("WARNING: No ANTHROPIC_API_KEY found in environment!")
    print("Set it in .env file or environment variables")

assistant = ClaudeAssistant(api_key) if api_key else None


@app.route('/')
def index():
    """Serve the main web interface"""
    return render_template('index.html')


@app.route('/api/chat', methods=['POST'])
def chat():
    """Handle chat messages from web interface"""
    if not assistant:
        return jsonify({
            'error': 'API key not configured. Please set ANTHROPIC_API_KEY in .env file'
        }), 500

    data = request.json
    message = data.get('message', '')
    session_id = data.get('session_id', 'default')

    if not message:
        return jsonify({'error': 'No message provided'}), 400

    # Get or create session history
    if session_id not in sessions:
        sessions[session_id] = []

    # Get response from Claude
    response, updated_history = assistant.chat(
        message,
        session_id,
        sessions[session_id]
    )

    # Update session
    sessions[session_id] = updated_history

    # Log interaction
    log_interaction(session_id, message, response)

    return jsonify({
        'response': response,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/clear', methods=['POST'])
def clear_history():
    """Clear conversation history for a session"""
    data = request.json
    session_id = data.get('session_id', 'default')

    if session_id in sessions:
        sessions[session_id] = []

    return jsonify({'status': 'cleared'})


@app.route('/api/status', methods=['GET'])
def status():
    """Check API status"""
    return jsonify({
        'status': 'online',
        'api_configured': assistant is not None,
        'active_sessions': len(sessions),
        'timestamp': datetime.now().isoformat()
    })


def log_interaction(session_id, user_msg, assistant_msg):
    """Log conversation to file"""
    try:
        log_file = Path(__file__).parent / 'web-session.log'
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"\n[{timestamp}] Session: {session_id}\n")
            f.write(f"User: {user_msg}\n")
            f.write(f"Claude: {assistant_msg}\n")
            f.write("-" * 80 + "\n")
    except Exception as e:
        print(f"Error logging: {e}")


if __name__ == '__main__':
    print("\n" + "="*70)
    print("🔥 MONSTER SUPER AI WEB SERVER")
    print("="*70)
    print(f"Starting server at: http://0.0.0.0:5000")
    print(f"API Key configured: {assistant is not None}")
    print("="*70 + "\n")

    app.run(host='0.0.0.0', port=5000, debug=True)
