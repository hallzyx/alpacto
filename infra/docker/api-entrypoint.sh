#!/bin/sh
# Resolve Stripe webhook secret for MVP (stripe listen in Compose).
# Prefer explicit STRIPE_WEBHOOK_SECRET (Dashboard / pinned CLI secret).
# Else, when STRIPE_USE_CLI=1 (default) and a secret file exists, load it.
set -eu

WHSEC_FILE="${STRIPE_WHSEC_FILE:-/run/stripe/whsec}"

if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ] && [ "${STRIPE_USE_CLI:-1}" = "1" ]; then
  echo "Waiting for Stripe CLI webhook secret at ${WHSEC_FILE}..."
  i=0
  while [ ! -s "$WHSEC_FILE" ] && [ "$i" -lt 60 ]; do
    i=$((i + 1))
    sleep 1
  done
  if [ -s "$WHSEC_FILE" ]; then
    STRIPE_WEBHOOK_SECRET="$(tr -d '\r\n' <"$WHSEC_FILE")"
    export STRIPE_WEBHOOK_SECRET
    echo "Loaded STRIPE_WEBHOOK_SECRET from Stripe CLI (${#STRIPE_WEBHOOK_SECRET} chars)"
  else
    echo "WARN: no Stripe CLI secret yet — Checkout webhooks will fail signature verify until CLI is up"
  fi
fi

exec yarn workspace @alpacto/api exec tsx src/server.ts
