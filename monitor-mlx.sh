#!/bin/bash
# MLX Studio Performance Monitor
# Usage: ./monitor-mlx.sh [port] [interval]

PORT=${1:-8080}
INTERVAL=${2:-5}
URL="http://127.0.0.1:$PORT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

clear
echo -e "${CYAN}=== MLX Studio Monitor ===${NC}"
echo -e "Endpoint: $URL"
echo -e "Refresh: ${INTERVAL}s"
echo -e "Press Ctrl+C to stop"
echo ""
echo -e "${BLUE}TIME      TOK/S    TTFT     TOKENS  CACHED   MODEL${NC}"
echo "----------------------------------------------------------------------"

while true; do
    # Get loaded model
    loaded=$(curl -s "$URL/api/models/loaded" 2>/dev/null)
    model=$(echo "$loaded" | jq -r '.loaded[0].model_id // "none"' 2>/dev/null | sed 's/.*\///' | cut -c1-25)

    # Benchmark with timing - measure TTFT
    RAND=$((RANDOM % 100))

    # Use streaming to measure TTFT (time to first chunk)
    START=$(python3 -c "import time; print(time.time())")

    FIRST_CHUNK_TIME=""
    FULL_RESPONSE=""

    # Stream and capture first chunk time
    while IFS= read -r line; do
        if [[ -z "$FIRST_CHUNK_TIME" && "$line" == data:* ]]; then
            FIRST_CHUNK_TIME=$(python3 -c "import time; print(time.time())")
        fi
        FULL_RESPONSE+="$line"
    done < <(curl -sN "$URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"devstral-24b\",\"messages\":[{\"role\":\"user\",\"content\":\"Count: $RAND to $((RAND+15))\"}],\"max_tokens\":80,\"temperature\":0,\"stream\":true}" 2>/dev/null)

    END=$(python3 -c "import time; print(time.time())")

    # Calculate TTFT
    if [[ -n "$FIRST_CHUNK_TIME" ]]; then
        TTFT=$(python3 -c "print(f'{($FIRST_CHUNK_TIME - $START):.2f}')")
    else
        TTFT="N/A"
    fi

    # Extract final stats from last chunk
    tps=$(echo "$FULL_RESPONSE" | grep -o '"tokens_per_second":[0-9.]*' | tail -1 | cut -d: -f2)
    tokens=$(echo "$FULL_RESPONSE" | grep -o '"completion_tokens":[0-9]*' | tail -1 | cut -d: -f2)
    cached=$(echo "$FULL_RESPONSE" | grep -o '"cached_tokens":[0-9]*' | tail -1 | cut -d: -f2)

    # Defaults
    tps=${tps:-0}
    tokens=${tokens:-0}
    cached=${cached:-0}

    # Color based on speed
    if (( $(echo "$tps > 35" | bc -l 2>/dev/null || echo 0) )); then
        TPS_COLOR=$GREEN
    elif (( $(echo "$tps > 25" | bc -l 2>/dev/null || echo 0) )); then
        TPS_COLOR=$YELLOW
    else
        TPS_COLOR=$NC
    fi

    # Color TTFT
    if [[ "$TTFT" != "N/A" ]]; then
        ttft_val=$(echo "$TTFT" | tr -d 's')
        if (( $(echo "$ttft_val < 1.0" | bc -l 2>/dev/null || echo 0) )); then
            TTFT_COLOR=$GREEN
        elif (( $(echo "$ttft_val < 2.0" | bc -l 2>/dev/null || echo 0) )); then
            TTFT_COLOR=$YELLOW
        else
            TTFT_COLOR=$RED
        fi
    else
        TTFT_COLOR=$NC
    fi

    TIME=$(date +%H:%M:%S)
    printf "%-10s ${TPS_COLOR}%-8.1f${NC} ${TTFT_COLOR}%-8s${NC} %-7s %-8s %s\n" \
        "$TIME" "$tps" "${TTFT}s" "$tokens" "$cached" "$model"

    sleep $INTERVAL
done
