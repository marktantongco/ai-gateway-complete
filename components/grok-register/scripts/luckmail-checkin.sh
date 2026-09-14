#!/bin/bash
# Daily LuckyMail checkin script
# Checks in with LuckyMail service to maintain account activity

set -e

LOG_FILE="/home/x3/workspace/grok-register/logs/luckmail-checkin.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "$(date '+%Y-%m-%d %H:%M:%S') Starting LuckyMail daily checkin..." >> "$LOG_FILE"

# LuckyMail checkin endpoint
LUCKMAIL_BASE_URL="https://mails.luckyous.com"
USERNAME="imarkytanky@gmail.com"
PASSWORD="Marky1986!!!"

# Perform checkin (heartbeat/keepalive)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  "${LUCKMAIL_BASE_URL}/api/checkin" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${USERNAME}\", \"password\": \"${PASSWORD}\"}" \
  2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Checkin successful: $BODY" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') Checkin failed (HTTP $HTTP_CODE): $BODY" >> "$LOG_FILE"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') LuckyMail checkin completed" >> "$LOG_FILE"
