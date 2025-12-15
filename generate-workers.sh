#!/bin/sh
# generate-workers.sh
# Usage: ./generate-workers.sh <start-index> <end-index>

set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <start-index> <end-index>" >&2
  exit 1
fi

START="$1"
END="$2"

if ! [ "$START" -gt 0 ] 2>/dev/null; then
  echo "Error: <start-index> must be a positive integer" >&2
  exit 1
fi

if ! [ "$END" -gt 0 ] 2>/dev/null; then
  echo "Error: <end-index> must be a positive integer" >&2
  exit 1
fi

if [ "$END" -lt "$START" ]; then
  echo "Error: <end-index> must be greater than or equal to <start-index>" >&2
  exit 1
fi

echo "version: '3.9'"
echo
echo "services:"

i="$START"
while [ "$i" -le "$END" ]; do
  cat <<EOF
  n9n-worker-$i:
    build:
      context: .
      dockerfile: ./Dockerfile
    container_name: n9n-worker-$i
    restart: unless-stopped
    env_file:
      - .env
    command:
      - node
      - apps/n9n/dist/index.js
      - start-worker
      - --name
      - worker$i
      - --webhook-secret
      - \${WEBHOOK_SECRET?WEBHOOK_SECRET is required}
      - --webhook-timeout-in-ms
      - "\${WEBHOOK_TIMEOUT_IN_MS?WEBHOOK_TIMEOUT_IN_MS is required}"
    environment:
      NODE_ENV: \${NODE_ENV:-production}
      ELASTICSEARCH_INDEX: \${ELASTICSEARCH_INDEX:-n9n-worker-$i}

EOF
  i=$((i + 1))
done