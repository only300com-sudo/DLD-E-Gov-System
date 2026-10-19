#!/bin/bash
# Multi-session SSE test — opens two SSE streams (Officer + Reception) on the same case,
# triggers writes via API, and confirms both streams receive every event within ~1s.
set -u
CASE_ID=$(cat /tmp/case_id.txt)
OFFICER_TOK=$(cat /tmp/officer_tok.txt)
RECEPTION_TOK=$(cat /tmp/reception_tok.txt)
OUT=/tmp/multi_session_sse
mkdir -p "$OUT"
rm -f "$OUT/officer.sse" "$OUT/reception.sse"

echo "=== Starting Officer SSE stream (background) ==="
( timeout 35 curl -sN --max-time 35 -H "Authorization: Bearer $OFFICER_TOK" \
    "http://localhost:3000/api/cases/$CASE_ID/stream" > "$OUT/officer.sse" 2>&1 ) &
OFF_PID=$!
echo "=== Starting Reception SSE stream (background) ==="
( timeout 35 curl -sN --max-time 35 -H "Authorization: Bearer $RECEPTION_TOK" \
    "http://localhost:3000/api/cases/$CASE_ID/stream" > "$OUT/reception.sse" 2>&1 ) &
REC_PID=$!
sleep 2
echo "Both streams connected."
echo ""

# --- #1 Presence ---
echo "=== #1 Presence ==="
echo "Officer stream presence events: $(grep -c 'presence' "$OUT/officer.sse")"
echo "Reception stream presence events: $(grep -c 'presence' "$OUT/reception.sse")"
echo ""

# --- #2 Live status update ---
echo "=== #2 Live status update (Reception triggers 'mark_intake_completed') ==="
curl -s --max-time 8 -X POST "http://localhost:3000/api/cases/$CASE_ID/action" \
  -H "Authorization: Bearer $RECEPTION_TOK" -H "Content-Type: application/json" \
  -d '{"action":"mark_intake_completed","reason":"Multi-session test: Reception marked intake"}' > /dev/null
sleep 1
echo "Officer stream events after status change:"
grep -E "event: (status\.changed|case\.updated)" "$OUT/officer.sse" | tail -3 || echo "  (none)"
echo "Reception stream events after status change:"
grep -E "event: (status\.changed|case\.updated)" "$OUT/reception.sse" | tail -3 || echo "  (none)"
echo ""

# --- #3/#5 Section lock ---
echo "=== #3/#5 Section lock (Officer acquires property_details lock) ==="
LOCK_RESP=$(curl -s --max-time 8 -X POST "http://localhost:3000/api/cases/$CASE_ID/locks" \
  -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
  -d '{"section":"property_details"}')
echo "Lock response: $LOCK_RESP" | head -c 200
echo ""
sleep 1
echo "Officer stream edit.lock events:"
grep -E "event: edit\.lock" "$OUT/officer.sse" | tail -3 || echo "  (none)"
echo "Reception stream edit.lock events:"
grep -E "event: edit\.lock" "$OUT/reception.sse" | tail -3 || echo "  (none)"
echo ""
echo "Active locks seen by Reception (GET /locks):"
curl -s --max-time 8 -X GET "http://localhost:3000/api/cases/$CASE_ID/locks" \
  -H "Authorization: Bearer $RECEPTION_TOK" | head -c 300
echo ""
echo ""

# --- #6 Lock release (manual, simulating disconnect/TTL) ---
echo "=== #6 Lock release ==="
curl -s --max-time 8 -X DELETE "http://localhost:3000/api/cases/$CASE_ID/locks/property_details" \
  -H "Authorization: Bearer $OFFICER_TOK" > /dev/null
sleep 1
echo "Reception stream edit.unlock events:"
grep -E "event: edit\.unlock" "$OUT/reception.sse" | tail -3 || echo "  (none)"
echo ""

# --- #7 Conflict resolution flow ---
echo "=== #7 Conflict resolution flow ==="
echo "  Step A: Reception PATCH nextAction v1 → success (v1→v2)"
curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $RECEPTION_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"nextAction":"Reception saved this"},"expectedVersions":{"nextAction":1}}' > /dev/null
sleep 1
echo "  Step B: Officer PATCH nextAction v1 (stale) → expect 409"
RESP_B=$(curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"nextAction":"Officer saved this (stale)"},"expectedVersions":{"nextAction":1}}')
echo "  Response B: $RESP_B" | head -c 400
echo ""
CONFLICT_ID=$(echo "$RESP_B" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['conflicts'][0].get('conflictId',''))" 2>/dev/null)
sleep 1
echo "  Officer stream conflict.detected:"
grep -E "event: conflict\.detected" "$OUT/officer.sse" | tail -2 || echo "  (none)"
echo "  Reception stream conflict.detected:"
grep -E "event: conflict\.detected" "$OUT/reception.sse" | tail -2 || echo "  (none)"
echo ""

echo "=== #7 Resolution paths ==="
echo "  Path 1: kept_b (Use Theirs)"
if [ -n "$CONFLICT_ID" ]; then
  curl -s --max-time 8 -X POST "http://localhost:3000/api/cases/$CASE_ID/conflicts/$CONFLICT_ID/resolve" \
    -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
    -d '{"resolution":"kept_b"}' | head -c 200
  echo ""
fi
sleep 1

# Create 2nd conflict for kept_a
echo "  Bump version to set up next conflict..."
curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $RECEPTION_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"internalNotes":"Reception v3"},"expectedVersions":{"internalNotes":1}}' > /dev/null
sleep 1
RESP_D=$(curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"internalNotes":"Officer v3 candidate"},"expectedVersions":{"internalNotes":1}}')
CONFLICT_ID_2=$(echo "$RESP_D" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['conflicts'][0].get('conflictId',''))" 2>/dev/null)
echo "  Path 2: kept_a (Keep Mine)"
if [ -n "$CONFLICT_ID_2" ]; then
  curl -s --max-time 8 -X POST "http://localhost:3000/api/cases/$CASE_ID/conflicts/$CONFLICT_ID_2/resolve" \
    -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
    -d '{"resolution":"kept_a"}' | head -c 200
  echo ""
fi
sleep 1

# Create 3rd conflict for merged
echo "  Bump version again..."
curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $RECEPTION_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"internalNotes":"Reception v4"},"expectedVersions":{"internalNotes":2}}' > /dev/null
sleep 1
RESP_F=$(curl -s --max-time 8 -X PATCH "http://localhost:3000/api/cases/$CASE_ID" \
  -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
  -d '{"fields":{"internalNotes":"Officer merge candidate"},"expectedVersions":{"internalNotes":2}}')
CONFLICT_ID_3=$(echo "$RESP_F" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['conflicts'][0].get('conflictId',''))" 2>/dev/null)
echo "  Path 3: merged (Merge Manually)"
if [ -n "$CONFLICT_ID_3" ]; then
  curl -s --max-time 8 -X POST "http://localhost:3000/api/cases/$CASE_ID/conflicts/$CONFLICT_ID_3/resolve" \
    -H "Authorization: Bearer $OFFICER_TOK" -H "Content-Type: application/json" \
    -d '{"resolution":"merged","mergedValue":"Merged: Reception v4 + Officer merge candidate"}' | head -c 200
  echo ""
fi
sleep 1
echo "  Officer stream conflict.resolved:"
grep -E "event: conflict\.resolved" "$OUT/officer.sse" | tail -3 || echo "  (none)"
echo "  Reception stream conflict.resolved:"
grep -E "event: conflict\.resolved" "$OUT/reception.sse" | tail -3 || echo "  (none)"
echo ""

# Final counts
echo "=== Final event counts ==="
echo "Officer stream total: $(grep -c '^id:' "$OUT/officer.sse")"
echo "Reception stream total: $(grep -c '^id:' "$OUT/reception.sse")"

wait $OFF_PID 2>/dev/null
wait $REC_PID 2>/dev/null
echo ""
echo "=== Raw SSE logs ==="
ls -la "$OUT/"
