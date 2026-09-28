#!/usr/bin/env bash
set -uo pipefail

pids=()

cd /app/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
pids+=($!)

if [[ -n "${LIVEKIT_URL:-}" && -n "${LIVEKIT_API_KEY:-}" && -n "${LIVEKIT_API_SECRET:-}" ]]; then
    cd /app/voice
    python voice_agent.py start &
    pids+=($!)
else
    echo "LIVEKIT_* tanımlı değil, ses worker'ı başlatılmadı."
fi

trap 'kill -TERM "${pids[@]}" 2>/dev/null' TERM INT

wait -n
status=$?

kill -TERM "${pids[@]}" 2>/dev/null
wait
exit "$status"
