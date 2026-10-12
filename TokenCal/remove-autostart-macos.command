#!/bin/bash
# TokenCal helper — remove autostart on macOS.
# Double-click this file in Finder (or run: bash remove-autostart-macos.command)

LABEL="com.tokencal.helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "ถอนการติดตั้งแล้ว ✅ (ไฟล์ที่เคยเซฟไว้ในโฟลเดอร์ของคุณไม่ถูกแตะต้อง)"
read -r -p "กด Enter เพื่อปิด..."
