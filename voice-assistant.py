#!/usr/bin/env python3
"""
Monster Super AI Voice Assistant
Voice-enabled Claude Code integration with real-time speech interaction
"""

import anthropic
import speech_recognition as sr
import pyttsx3
import os
import sys
import json
from datetime import datetime
from pathlib import Path

class VoiceClaudeAssistant:
    """Voice-enabled assistant for Claude Code with MCP support"""

    def __init__(self, api_key):
        """Initialize the voice assistant"""
        self.client = anthropic.Anthropic(api_key=api_key)
        self.recognizer = sr.Recognizer()
        self.tts_engine = pyttsx3.init()
        self.conversation_history = []
        self.session_start = datetime.now()

        # Configure TTS voice settings
        self._configure_voice()

        # Load MCP context if available
        self.mcp_context = self._load_mcp_context()

        self._print_banner()

    def _configure_voice(self):
        """Configure text-to-speech settings"""
        voices = self.tts_engine.getProperty('voices')

        # Try to select a good voice (prefer David/male voices for Jarvis feel)
        for voice in voices:
            if 'david' in voice.name.lower() or 'male' in voice.name.lower():
                self.tts_engine.setProperty('voice', voice.id)
                break

        self.tts_engine.setProperty('rate', 175)  # Speaking speed
        self.tts_engine.setProperty('volume', 0.95)  # Volume level

    def _load_mcp_context(self):
        """Load MCP server context from server.json if available"""
        try:
            server_json = Path(__file__).parent / 'server.json'
            if server_json.exists():
                with open(server_json, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️  Could not load MCP context: {e}")
        return None

    def _print_banner(self):
        """Display startup banner"""
        print("\n" + "="*70)
        print("🔥 MONSTER SUPER AI - VOICE INTERFACE")
        print("="*70)
        print(f"📅 Session started: {self.session_start.strftime('%Y-%m-%d %H:%M:%S')}")
        if self.mcp_context:
            print("🌐 Firecrawl MCP Server: Connected")
        print("="*70 + "\n")

    def speak(self, text, show_thinking=False):
        """Convert text to speech with visual feedback"""
        if show_thinking:
            print("\n🧠 Claude is thinking...")

        print(f"\n🤖 Claude: {text}\n")
        print("-" * 70)

        try:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()
        except Exception as e:
            print(f"⚠️  TTS Error: {e}")

    def listen(self):
        """Capture voice input from microphone"""
        with sr.Microphone() as source:
            print("\n🎤 Listening... (speak now)")
            print("💡 Say 'exit', 'quit', or 'goodbye' to end session")
            print("💡 Say 'clear history' to reset conversation")
            print()

            # Adjust for ambient noise
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)

            try:
                # Listen for audio with timeout
                audio = self.recognizer.listen(source, timeout=10, phrase_time_limit=20)
                print("🔄 Processing speech...")

                # Use Google Speech Recognition (free, no API key needed)
                text = self.recognizer.recognize_google(audio)
                print(f"\n👤 You: {text}\n")
                return text

            except sr.WaitTimeoutError:
                print("⏱️  No speech detected. Listening again...")
                return None
            except sr.UnknownValueError:
                print("❌ Could not understand audio. Please speak clearly.")
                return None
            except sr.RequestError as e:
                print(f"❌ Speech service error: {e}")
                self.speak("Speech recognition service is unavailable.")
                return None

    def chat_with_claude(self, user_message):
        """Send message to Claude API and get response"""
        try:
            # Add user message to history
            self.conversation_history.append({
                "role": "user",
                "content": user_message
            })

            # Build system message with MCP context if available
            system_message = "You are a helpful AI assistant with voice interaction capabilities."
            if self.mcp_context:
                system_message += "\n\nYou have access to Firecrawl MCP tools for web scraping and content extraction."

            # Call Claude API with latest Sonnet 4.5 model
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                temperature=1.0,
                system=system_message,
                messages=self.conversation_history
            )

            # Extract Claude's response
            claude_response = response.content[0].text

            # Add to conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": claude_response
            })

            # Save conversation to log
            self._log_conversation(user_message, claude_response)

            return claude_response

        except anthropic.APIError as e:
            error_msg = f"API Error: {str(e)}"
            print(f"❌ {error_msg}")
            return "I encountered an API error. Please check your API key and try again."
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            print(f"❌ {error_msg}")
            return "I encountered an unexpected error. Please try again."

    def _log_conversation(self, user_msg, assistant_msg):
        """Log conversation to file for debugging/history"""
        try:
            log_file = Path(__file__).parent / 'voice-session.log'
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n[{timestamp}]\n")
                f.write(f"User: {user_msg}\n")
                f.write(f"Claude: {assistant_msg}\n")
                f.write("-" * 80 + "\n")
        except Exception as e:
            print(f"⚠️  Could not write to log: {e}")

    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
        print("\n🗑️  Conversation history cleared.\n")
        self.speak("Conversation history has been cleared. Starting fresh!")

    def run(self):
        """Main conversation loop"""
        welcome = (
            "Monster Super AI voice interface activated. "
            "I'm Claude, ready to assist you with coding, web scraping, and more. "
            "How can I help you today?"
        )
        self.speak(welcome)

        while True:
            # Listen for user input
            user_input = self.listen()

            if user_input is None:
                continue

            # Check for special commands
            lower_input = user_input.lower()

            # Exit commands
            exit_commands = ['exit', 'quit', 'goodbye', 'shut down', 'shutdown', 'stop']
            if any(cmd in lower_input for cmd in exit_commands):
                goodbye = "Shutting down Monster Super AI. Great working with you! See you next time!"
                self.speak(goodbye)
                break

            # Clear history command
            if 'clear history' in lower_input or 'reset conversation' in lower_input:
                self.clear_history()
                continue

            # Get response from Claude
            print("🧠 Thinking...")
            response = self.chat_with_claude(user_input)

            # Speak the response
            self.speak(response, show_thinking=False)

        # Print session summary
        session_duration = datetime.now() - self.session_start
        print("\n" + "="*70)
        print(f"Session ended at {datetime.now().strftime('%H:%M:%S')}")
        print(f"Duration: {session_duration}")
        print(f"Messages exchanged: {len(self.conversation_history)}")
        print("="*70 + "\n")


def load_api_key():
    """Load API key from environment or prompt user"""
    # Try to load from .env file
    env_file = Path(__file__).parent / '.env'
    if env_file.exists():
        try:
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('ANTHROPIC_API_KEY='):
                        key = line.split('=', 1)[1].strip()
                        if key and not key.startswith('#'):
                            return key
        except Exception as e:
            print(f"⚠️  Error reading .env file: {e}")

    # Check environment variable
    if 'ANTHROPIC_API_KEY' in os.environ:
        return os.environ['ANTHROPIC_API_KEY']

    # Prompt user
    print("\n🔐 Enter your Claude API key:")
    print("💡 You can save it in .env file as ANTHROPIC_API_KEY=your_key_here\n")
    api_key = input("API Key: ").strip()

    if not api_key:
        print("❌ No API key provided. Exiting...")
        sys.exit(1)

    return api_key


def main():
    """Main entry point"""
    print("\n🚀 Initializing Monster Super AI Voice Assistant...")

    # Load API key
    api_key = load_api_key()

    # Initialize assistant
    assistant = VoiceClaudeAssistant(api_key)

    try:
        # Run main conversation loop
        assistant.run()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user. Shutting down...")
        assistant.speak("Emergency shutdown initiated. Goodbye!")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
