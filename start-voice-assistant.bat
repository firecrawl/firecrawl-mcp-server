@echo off
REM Monster Super AI Voice Assistant - Windows Startup Script
REM This script launches the voice-enabled Claude assistant

title Monster Super AI Voice Interface
color 0A

echo.
echo ========================================================================
echo                  MONSTER SUPER AI VOICE INTERFACE
echo ========================================================================
echo                         Initializing...
echo ========================================================================
echo.

REM Change to the script directory
cd /d "%~dp0"

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH!
    echo Please install Python from https://python.org
    echo.
    pause
    exit /b 1
)

REM Check if requirements are installed
echo Checking dependencies...
python -c "import anthropic, speech_recognition, pyttsx3" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing required Python packages...
    echo.
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies!
        echo.
        pause
        exit /b 1
    )
)

REM Check for .env file
if not exist ".env" (
    echo.
    echo WARNING: No .env file found!
    echo You will be prompted to enter your Claude API key.
    echo To avoid this in the future, create a .env file with:
    echo ANTHROPIC_API_KEY=your_key_here
    echo.
    pause
)

echo.
echo Starting Monster Super AI...
echo.

REM Run the voice assistant
python voice-assistant.py

REM Keep window open if there was an error
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Voice assistant exited with error code %errorlevel%
    echo.
    pause
)

exit /b 0
