@echo off
REM Restarts ONLY the API server, leaving the Vite dev server alone.
REM
REM Killing every node.exe would also take down the frontend, so this finds the
REM process actually listening on the API port and stops just that one.

setlocal
set PORT=5000

echo.
echo   Stopping anything on port %PORT%...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%PORT% "') do (
    echo     killing PID %%p
    taskkill /F /PID %%p >nul 2>&1
)

REM Give Windows a moment to release the port, otherwise the new process can
REM fail with EADDRINUSE against the socket that is still closing.
ping -n 3 127.0.0.1 >nul

echo   Starting server...
start "cms-server" /min /d "%~dp0server" cmd /c "node server.js"

ping -n 5 127.0.0.1 >nul

echo.
echo   Health check:
curl -s http://localhost:%PORT%/api/health
echo.
echo.
echo   If "payments" says "remita", real checkout is live.
echo   If it says "simulated", the Remita credentials are still missing.
echo.

endlocal
