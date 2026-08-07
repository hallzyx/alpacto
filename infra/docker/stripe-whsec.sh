#!/bin/sh
# One-shot: write Stripe CLI webhook signing secret for the API container.
set -eu

OUT="${STRIPE_WHSEC_FILE:-/shared/whsec}"
mkdir -p "$(dirname "$OUT")"

if [ -z "${STRIPE_API_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY empty — skipping CLI whsec (set STRIPE_WEBHOOK_SECRET manually for Dashboard mode)"
  : >"$OUT"
  exit 0
fi

echo "Fetching Stripe CLI webhook signing secret..."
secret="$(stripe listen --print-secret)"
printf '%s' "$secret" >"$OUT"
echo "Wrote whsec to $OUT"
