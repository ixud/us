#!/bin/bash
# TokenCal — ตรวจสุขภาพ helper (ดับเบิลคลิกไฟล์นี้ใน Finder ได้เลย)
cd "$(dirname "$0")" || exit 1

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
  echo "❌ ไม่พบ Node.js — ติดตั้งก่อนที่ https://nodejs.org/ (เลือก LTS)"
else
  "$NODE" tests/check-installed-helper.mjs
fi

echo ""
read -r -p "กด Enter เพื่อปิด..."
