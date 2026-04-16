#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT_DIR/output/pi"
LOG_PATH="$ROOT_DIR/output/pi/interactive-renderer.log"
rm -f "$LOG_PATH"

PI_CLI="$(cd "$ROOT_DIR" && node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const storeRoot = path.join(process.cwd(), "node_modules", ".pnpm");
const entries = fs.readdirSync(storeRoot);
const pkgDir = entries.find(entry => entry.startsWith("@mariozechner+pi-coding-agent@"));
if (!pkgDir) {
  console.error("Could not find @mariozechner/pi-coding-agent in node_modules/.pnpm");
  process.exit(1);
}
process.stdout.write(path.join(storeRoot, pkgDir, "node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js"));
NODE
)"

EXTENSION_PATH="$ROOT_DIR/packages/extensions/src/pi-extension.ts"

expect <<EOF >/dev/null 2>&1 || true
set timeout 60
set send_slow {1 0.03}
log_file -a "$LOG_PATH"
spawn node "$PI_CLI" --offline --no-session --no-extensions -e "$EXTENSION_PATH"
expect -re {~/Documents/DOO/harness \(main\)|gpt-5\.4}
after 1500
send -s -- "/harness help --json"
send -- "\r"
after 9000
send -- "\003"
after 200
send -- "\003"
expect eof
EOF

SANITIZED="$(python3 - <<'PY' "$LOG_PATH"
from pathlib import Path
import re, sys
text = Path(sys.argv[1]).read_text(errors="ignore")
plain = re.sub(r'\x1b\[[0-9;?]*[ -/]*[@-~]', '', text)
plain = plain.replace('\r', '\n')
print(plain)
PY
)"

require_match() {
  local pattern="$1"
  local label="$2"
  if ! printf '%s\n' "$SANITIZED" | grep -q "$pattern"; then
    echo "interactive-renderer smoke failed: missing $label" >&2
    echo "interactive-renderer log: $LOG_PATH" >&2
    exit 2
  fi
}

require_match "Extensions" "extension list"
require_match "pi-extension.ts" "harness extension path"
require_match "settings" "slash command menu"

echo "interactive-renderer smoke: PASS"
echo "interactive-renderer log: $LOG_PATH"
