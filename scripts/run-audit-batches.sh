#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TOTAL=$(wc -l < scripts/audit-task-refs.jsonl | tr -d ' ')
DONE=$(wc -l < scripts/audit-task-results.jsonl 2>/dev/null | tr -d ' ' || echo 0)
echo "Refs: $TOTAL  Already audited: $DONE"
while [ "$DONE" -lt "$TOTAL" ]; do
  echo "=== auditing next slice ($DONE/$TOTAL) ==="
  SKIP_COLLECT=1 RESUME_AUDIT=1 MAX_NEW_AUDITS=12 \
    NODE_OPTIONS='--max-old-space-size=1536' \
    npx tsx scripts/audit-task-parsers.ts 2>&1 | tail -3
  DONE=$(wc -l < scripts/audit-task-results.jsonl | tr -d ' ')
done
SKIP_COLLECT=1 RESUME_AUDIT=1 WRITE_REPORT_ONLY=1 \
  NODE_OPTIONS='--max-old-space-size=2048' \
  npx tsx scripts/audit-task-parsers.ts
