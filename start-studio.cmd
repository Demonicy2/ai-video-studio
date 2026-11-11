@echo off
cd /d "%~dp0"
echo ==========================================================
echo   AI VIDEO STUDIO - Starting Web App + Background Worker
echo   Open in browser: http://localhost:3000
echo   Demo Account:    demo@aivideostudio.local / password123
echo ==========================================================
call "%~dp0bin\node.cmd" server/http-server.ts
pause

