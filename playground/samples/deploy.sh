#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-staging}"
RETRIES=3

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

for i in $(seq 1 "$RETRIES"); do
  if curl -fsS "https://example.com/$TARGET/health" > /dev/null; then
    log "healthy after $i tries"
    exit 0
  fi
  sleep 2
done

log "giving up on $TARGET" >&2
exit 1
