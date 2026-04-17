#!/usr/bin/env bash
set -euo pipefail

# Render all 5 store screenshots to PNG at 1280x800 using headless Chrome.
# Output: extension/store-screenshots/out/*.png

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/out"
mkdir -p "$OUT"

for f in 01-save 02-reader 03-kindle 04-twitter 05-dashboard; do
  echo "Rendering $f..."
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1280,800 \
    --screenshot="$OUT/$f.png" \
    "file://$DIR/$f.html" \
    >/dev/null 2>&1
done

echo ""
echo "Done. Screenshots in: $OUT"
ls -lh "$OUT"
