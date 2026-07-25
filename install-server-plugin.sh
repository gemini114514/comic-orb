#!/usr/bin/env sh
set -eu

PLUGIN_ID="comic-orb"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE="$SCRIPT_DIR/server-plugins/$PLUGIN_ID"
ROOT="${1:-}"

is_root() {
  [ -f "$1/config.yaml" ] && [ -f "$1/server.js" ] && [ -f "$1/src/plugin-loader.js" ]
}

if [ -z "$ROOT" ]; then
  CURRENT="$SCRIPT_DIR"
  DEPTH=0
  while [ "$DEPTH" -lt 12 ]; do
    if is_root "$CURRENT"; then ROOT="$CURRENT"; break; fi
    PARENT=$(dirname "$CURRENT")
    [ "$PARENT" = "$CURRENT" ] && break
    CURRENT="$PARENT"
    DEPTH=$((DEPTH + 1))
  done
fi

if [ -z "$ROOT" ] || ! is_root "$ROOT"; then
  printf 'Usage: %s /path/to/SillyTavern\n' "$0" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
cp "$ROOT/config.yaml" "$ROOT/config.yaml.comic-orb-backup-$STAMP"
if grep -Eq '^[[:space:]]*enableServerPlugins[[:space:]]*:' "$ROOT/config.yaml"; then
  sed -i.bak -E 's/^([[:space:]]*)enableServerPlugins[[:space:]]*:[[:space:]]*(true|false)[[:space:]]*$/\1enableServerPlugins: true/' "$ROOT/config.yaml"
else
  printf '\nenableServerPlugins: true\n' >> "$ROOT/config.yaml"
fi

mkdir -p "$ROOT/plugins"
DESTINATION="$ROOT/plugins/$PLUGIN_ID"
if [ -e "$DESTINATION" ] || [ -L "$DESTINATION" ]; then
  mv "$DESTINATION" "$DESTINATION.backup-$STAMP"
fi
ln -s "$SOURCE" "$DESTINATION"

printf 'Comic Orb Server Plugin installed:\n  %s -> %s\nRestart SillyTavern, then recheck the backend status.\n' "$DESTINATION" "$SOURCE"
