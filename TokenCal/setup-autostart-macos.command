#!/bin/bash
# TokenCal helper — one-time setup for macOS.
# Double-click this file in Finder (or run: bash setup-autostart-macos.command)
# It creates ~/Library/LaunchAgents/com.tokencal.helper.plist so the helper
# starts automatically at every login, then starts it right now.

cd "$(dirname "$0")" || exit 1
LABEL="com.tokencal.helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HELPER="$(pwd)/tokencal-helper.js"

if [ ! -f "$HELPER" ]; then
  echo "❌ ไม่พบไฟล์ tokencal-helper.js ในโฟลเดอร์นี้"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  for p in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$p" ]; then NODE="$p"; fi
  done
fi

if [ -z "$NODE" ]; then
  echo "❌ ไม่พบ Node.js ในเครื่อง"
  echo "   ติดตั้งก่อนได้ที่ https://nodejs.org/ (เลือก LTS) หรือพิมพ์: brew install node"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$HELPER</string>
  </array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(pwd)/tokencal-helper.out.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/tokencal-helper.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo "✅ ติดตั้งและเปิดใช้แล้ว"
echo "   Node:   $NODE"
echo "   Helper: $HELPER"
echo "   Plist:  $PLIST"
echo ""
echo "   ตรวจสอบสถานะ: launchctl list | grep tokencal"
echo "   ต่อไปกลับไปที่ claude.ai แล้วกด 'ตั้งค่าโฟลเดอร์' ในแผง TokenCal"
echo ""
read -r -p "กด Enter เพื่อปิด..."
