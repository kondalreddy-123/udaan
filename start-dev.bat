@echo off
setlocal
rem One-click dev launcher for UDAAN.
rem Starts the FastAPI backend (port 8000) and the Vite frontend (port 5173).
rem The Vite proxy forwards /api -> http://localhost:8000, so BOTH must run.

set "ROOT=%~dp0"

echo.
echo   UDAAN dev launcher
echo   ------------------
echo   Backend : http://127.0.0.1:8000  (docs at /docs)
echo   Frontend: http://localhost:5173
echo.

rem Skip starting the API if something is already listening on port 8000,
rem otherwise uvicorn exits with WinError 10048 (address already in use).
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo   Backend already running on port 8000 - skipping.
) else (
    start "UDAAN Backend" /d "%ROOT%backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
    rem Give the API a moment to bind the port before the UI starts calling it.
    timeout /t 3 /nobreak >nul
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo   Frontend already running on port 5173 - skipping.
) else (
    start "UDAAN Frontend" /d "%ROOT%frontend" cmd /k "npm run dev"
)

echo   Two windows opened. Close them to stop the services.
echo.
endlocal
