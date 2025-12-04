@echo off
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║       🔥 MONSTER SUPER AI - BEAST EDITION INSTALLER 🔥  ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Installing dependencies...
echo.

npm install --save @anthropic-ai/sdk@^0.39.0 @deepgram/sdk@^3.0.0 livekit-server-sdk@^2.0.0 axios@^1.6.0 cors@^2.8.5 dotenv@^16.3.1 express@^4.18.2 openai@^4.20.0 ws@^8.14.0

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║                 ✅ INSTALLATION COMPLETE! ✅             ║
echo ║                                                           ║
echo ║  To start the server, run:                               ║
echo ║  START_BEAST.bat                                         ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
pause
