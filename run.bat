@echo off
title Slotjack Telegram Bot ^& Web Dashboard Launcher
color 0C

echo ==========================================================
echo 🎰 Slotjack Telegram Bot ^& Web Dashboard Launcher
echo ==========================================================

:: Set the Bot Token if not already set
if "%TELEGRAM_BOT_TOKEN%"=="" (
    if exist .env (
        for /f "usebackq tokens=1,2 delims==" %%i in (".env") do (
            if "%%i"=="TELEGRAM_BOT_TOKEN" set TELEGRAM_BOT_TOKEN=%%j
        )
    )
)

:: Use default token if still empty
if "%TELEGRAM_BOT_TOKEN%"=="" (
    set TELEGRAM_BOT_TOKEN=8996262600:AAH1Ml6SK1egdTR7w5vLD7veH5wRo5xOFwQ
)

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Python is not installed or not added to your PATH environment variable!
    echo Please install Python 3 from https://www.python.org/ and check "Add Python to PATH" during installation.
    pause
    exit /b
)

echo 📦 Creating virtual environment (venv)...
python -m venv venv

echo ⚙️ Activating virtual environment...
call venv\Scripts\activate.bat

echo 🔌 Installing dependencies from requirements.txt...
python -m pip install --upgrade pip
pip install -r requirements.txt

echo 🟢 Starting Telegram Bot and Flask Admin Panel concurrently...
echo 👉 Telegram Bot is running in a separate window.
echo 👉 Web Panel will be accessible at http://localhost:5000
echo ----------------------------------------------------------

:: Start bot in a background process window, and app in current window
start cmd /k "call venv\Scripts\activate.bat && set TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN% && python bot.py"
python app.py

pause
