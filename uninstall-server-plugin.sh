#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT="${1:-}"
if [ -z "$ROOT" ]; then
  CURRENT="$SCRIPT_DIR"
  DEPTH=0
  while [ "$DEPTH" -lt 12 ]; do
    if [ -f "$CURRENT/config.yaml" ] && [ -f "$CURRENT/server.js" ]; then ROOT="$CURRENT"; break; fi
    PARENT=$(dirname "$CURRENT")
    [ "$PARENT" = "$CURRENT" ] && break
    CURRENT="$PARENT"
    DEPTH=$((DEPTH + 1))
  done
fi

if [ -z "$ROOT" ]; then
  printf 'Usage: %s /path/to/SillyTavern\n' "$0" >&2
  exit 1
fi

DESTINATION="$ROOT/plugins/comic-orb"
if [ -L "$DESTINATION" ]; then
  rm "$DESTINATION"
  printf 'Removed %s. Restart SillyTavern.\n' "$DESTINATION"
elif [ -e "$DESTINATION" ]; then
  printf 'Refusing to delete non-symlink directory: %s\n' "$DESTINATION" >&2
  exit 1
else
  printf 'Comic Orb Server Plugin is not installed.\n'
fi
