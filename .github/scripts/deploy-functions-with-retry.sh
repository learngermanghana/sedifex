#!/usr/bin/env bash

set -euo pipefail

readonly MAX_ATTEMPTS=3
readonly RETRYABLE_ERROR='Error: Failed to list functions for'
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "Firebase Functions deployment attempt ${attempt}/${MAX_ATTEMPTS}"

  : > "$output_file"
  set +e
  firebase deploy --only "${FUNCTIONS_ONLY:?FUNCTIONS_ONLY must be set}" --project "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID must be set}" --force 2>&1 | tee "$output_file"
  status=${PIPESTATUS[0]}
  set -e

  if [[ $status -eq 0 ]]; then
    exit 0
  fi

  if [[ $attempt -eq $MAX_ATTEMPTS ]] || ! grep -Fq "$RETRYABLE_ERROR" "$output_file"; then
    exit "$status"
  fi

  delay=$((attempt * 15))
  echo "Firebase could not list functions; retrying in ${delay} seconds..."
  sleep "$delay"
done
