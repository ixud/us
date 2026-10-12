#!/bin/bash
# TokenCal helper — manual start on macOS (keeps Terminal open, useful for troubleshooting).
cd "$(dirname "$0")" || exit 1
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  echo "❌ ไม่พบ Node.js — ติดตั้งที่ https://nodejs.org/ หรือ brew install node"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi
exec "$NODE" tokencal-helper.js
