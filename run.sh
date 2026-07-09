#!/bin/bash
# Slotjack Telegram Bot & Web Dashboard launcher for macOS / Linux

echo "=========================================================="
echo "🚀 Slotjack Telegram Bot & Web Dashboard Launcher"
echo "=========================================================="

# Check for TELEGRAM_BOT_TOKEN
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    if [ -f .env ]; then
        # Load token from .env if present
        export $(grep -v '^#' .env | xargs)
    fi
fi

# Set default token if empty
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    export TELEGRAM_BOT_TOKEN="8996262600:AAH1Ml6SK1egdTR7w5vLD7veH5wRo5xOFwQ"
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null
then
    echo "❌ Error: Python 3 is not installed on your system!"
    echo "Please download and install Python from https://www.python.org/"
    exit 1
fi

echo "📦 Creating virtual environment (venv)..."
python3 -m venv venv
source venv/bin/activate

echo "⚙️ Installing dependencies from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

echo "🟢 Starting Telegram Bot and Flask Admin Panel concurrently..."
echo "👉 Telegram Bot is running on your bot token."
echo "👉 Web Panel will be accessible at http://localhost:5000"
echo "----------------------------------------------------------"

# Run both scripts (bot in the background, web app in the foreground)
python3 bot.py &
python3 app.py
