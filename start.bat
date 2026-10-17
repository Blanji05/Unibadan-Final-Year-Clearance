@echo off
REM Starts the whole app on localhost: MySQL-backed API + Vite frontend.
REM
REM Both halves are needed — the React app is only a shell that reads
REM everything over HTTP, so starting it alone gives a page that loads but
REM cannot log in.

setlocal
cd /d "%~dp0"

set API_PORT=5000
set WEB_PORT=5173

REM A missing .env is the most common reason startup fails, and the resulting
REM error (a DB connection refusal) does not obviously point back to it.
if not exist "server\.env" (
    echo.
    echo   ERROR: server\.env is missing.
    echo.
    echo   Create it first:
    echo       copy server\.env.example server\.env
    echo   then fill in DB_PASSWORD and JWT_SECRET.
    echo.
    exit /b 1
)

if not exist "server\node_modules" (
    echo   Installing server dependencies...
    call npm --prefix server install
)

if not exist "client\node_modules" (
    echo   Installing client dependencies...
    call npm --prefix client install
)

REM Free the ports so a leftover process from a previous run does not cause the
REM new one to die with EADDRINUSE.
echo.
echo   Freeing ports %API_PORT% and %WEB_PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%API_PORT% "') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%WEB_PORT% "') do taskkill /F /PID %%p >nul 2>&1

ping -n 3 127.0.0.1 >nul

echo   Starting API on http://localhost:%API_PORT% ...
start "cms-server" /min /d "%~dp0server" cmd /c "node server.js"

echo   Starting frontend on http://localhost:%WEB_PORT% ...
start "cms-client" /min /d "%~dp0client" cmd /c "npm run dev"

REM Vite needs a few seconds before it accepts connections.
ping -n 10 127.0.0.1 >nul

echo.
echo   API health:
curl -s http://localhost:%API_PORT%/api/health
echo.

echo.
echo   ============================================================
echo     Open:  http://localhost:%WEB_PORT%
echo.
echo     Sign in with any seeded account (password Password123!):
echo       student  anjoola@student.ui.edu.ng
echo       officer  library@ui.edu.ng
echo       admin    admin@ui.edu.ng
echo.
echo     Both services run in minimised windows titled
echo     "cms-server" and "cms-client". Close them to stop.
echo   ============================================================
echo.

start http://localhost:%WEB_PORT%

endlocal
