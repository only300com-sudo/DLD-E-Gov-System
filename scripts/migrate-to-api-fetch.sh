#!/bin/bash
# scripts/migrate-to-api-fetch.sh
# Bulk migration: replace raw fetch() with apiFetch() across src/
# Removes manual X-CSRF-Token header assignments (the wrapper handles it)
#
# Usage: bash scripts/migrate-to-api-fetch.sh
# Run in batches of 20 files — review test output between batches.

set -e

# Find all .tsx/.ts files with raw fetch() calls (excluding api-client.ts itself)
FILES=$(grep -rl 'await fetch(' src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "lib/api-client.ts" | sort)

TOTAL=$(echo "$FILES" | wc -l)
COUNT=0

for file in $FILES; do
  COUNT=$((COUNT + 1))
  
  # Skip if already migrated (no raw fetch calls)
  if ! grep -q 'await fetch(' "$file" 2>/dev/null; then
    continue
  fi
  
  echo "[$COUNT/$TOTAL] Migrating: $file"
  
  # 1. Add import if not present
  if ! grep -q 'import { apiFetch }' "$file" 2>/dev/null; then
    # Find the last import line and add after it
    LAST_IMPORT=$(grep -n '^import ' "$file" | tail -1 | cut -d: -f1)
    if [ -n "$LAST_IMPORT" ]; then
      sed -i "${LAST_IMPORT}a\\import { apiFetch } from \"@/lib/api-client\";" "$file"
    else
      # No imports — add at the top (after "use client" if present)
      if head -1 "$file" | grep -q '"use client"'; then
        sed -i '1a\\import { apiFetch } from "@/lib/api-client";' "$file"
      else
        sed -i '1i\\import { apiFetch } from "@/lib/api-client";' "$file"
      fi
    fi
  fi
  
  # 2. Replace 'await fetch(' with 'await apiFetch('
  sed -i 's/await fetch(/await apiFetch(/g' "$file"
  
  # 3. Remove manual X-CSRF-Token header assignments
  # Pattern: "X-CSRF-Token": session?.csrfToken ?? "",
  # Pattern: "X-CSRF-Token": session.csrfToken ?? "",
  # Pattern: "X-CSRF-Token": getCsrfToken() ?? "",
  # Pattern: "X-CSRF-Token": csrfToken ?? "",
  # Pattern: "X-CSRF-Token": session?.csrfToken || "",
  sed -i '/"X-CSRF-Token":.*session.*csrfToken/d' "$file"
  sed -i '/"X-CSRF-Token":.*getCsrfToken/d' "$file"
  sed -i '/"X-CSRF-Token":.*csrfToken/d' "$file"
  sed -i "/'X-CSRF-Token':.*csrfToken/d" "$file"
  
  # 4. Remove trailing comma issues from removed lines
  # (if the X-CSRF-Token line was the last header, the previous line might have a trailing comma)
  # This is handled by the linter — if lint fails, the developer fixes manually
  
done

echo ""
echo "=== Migration complete: $COUNT files processed ==="
echo "Run: npm run test:lint && npm run test:regression"
